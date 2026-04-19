import datetime as dt
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlmodel import Session, select

from ..exceptions import Conflict, DomainError, Forbidden, NotFound
from ..models import DailyOrder, Event, Membership, PriceItem, Purchase, User
from ..schemas.orders import (
    AggregateConsumerOut,
    AggregateItemOut,
    AggregateOut,
    OrderItemOut,
    OrderOut,
    OrderUpsertIn,
)
from ..services.memberships import require_member


def _get_timezone(ev: Event) -> ZoneInfo:
    try:
        return ZoneInfo(ev.timezone)
    except ZoneInfoNotFoundError, KeyError:
        raise DomainError("invalid event timezone") from None


def cutoff_has_passed(ev: Event, target_date: dt.date, now: dt.datetime | None = None) -> bool:
    """Return True if the cutoff for target_date has already passed.

    The cutoff for a given date occurs at (target_date - 1) at ev.cutoff_time in the event TZ.
    """
    if now is None:
        now = dt.datetime.now(dt.UTC)
    tz = _get_timezone(ev)
    cutoff_local = dt.datetime.combine(target_date - dt.timedelta(days=1), ev.cutoff_time).replace(
        tzinfo=tz
    )
    return now >= cutoff_local.astimezone(dt.UTC)


def _member_active_on_date(member: Membership, date: dt.date, tz: ZoneInfo) -> bool:
    joined_date = member.joined_at.astimezone(tz).date()
    left_date = member.left_at.astimezone(tz).date() if member.left_at else None
    return (date >= joined_date) and (left_date is None or date < left_date)


def upsert_order(
    session: Session,
    event_id: uuid.UUID,
    for_date: dt.date,
    data: OrderUpsertIn,
    user: User,
) -> None:
    if data.date != for_date:
        raise DomainError("path date and body date must match")

    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    member = require_member(session, ev.id, user.id)

    if for_date < ev.start_date or for_date > ev.end_date:
        raise DomainError("date outside event window")

    tz = _get_timezone(ev)
    if not _member_active_on_date(member, for_date, tz):
        raise Forbidden("not a member for this date")

    if cutoff_has_passed(ev, for_date):
        raise Forbidden("orders locked for this date (cutoff passed)")

    if session.exec(
        select(Purchase).where(Purchase.event_id == ev.id, Purchase.date == for_date)
    ).first():
        raise Forbidden("orders locked: purchase already finalized for this date")

    active_item_ids = set(
        session.exec(
            select(PriceItem.id).where(PriceItem.event_id == ev.id, PriceItem.active == True)  # noqa: E712
        ).all()
    )
    all_item_ids = set(session.exec(select(PriceItem.id).where(PriceItem.event_id == ev.id)).all())

    norm_items: list[dict] = []
    inactive_ids: list[str] = []
    unknown_ids: list[str] = []
    for it in data.items:
        if it.qty < 0:
            raise DomainError("qty must be >= 0")
        pid = it.price_item_id
        if pid not in all_item_ids:
            unknown_ids.append(str(pid))
            continue
        if pid not in active_item_ids:
            inactive_ids.append(str(pid))
            continue
        norm_items.append({"price_item_id": str(it.price_item_id), "qty": int(it.qty)})

    if inactive_ids or unknown_ids:
        raise Conflict({"inactive_item_ids": inactive_ids, "unknown_item_ids": unknown_ids})

    existing = session.exec(
        select(DailyOrder).where(
            DailyOrder.event_id == ev.id,
            DailyOrder.user_id == user.id,
            DailyOrder.date == for_date,
        )
    ).first()
    if existing:
        existing.items = norm_items
    else:
        session.add(DailyOrder(event_id=ev.id, user_id=user.id, date=for_date, items=norm_items))
    session.commit()


def get_my_order(session: Session, event_id: uuid.UUID, for_date: dt.date, user: User) -> OrderOut:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    member = require_member(session, ev.id, user.id)

    tz = _get_timezone(ev)
    if not _member_active_on_date(member, for_date, tz):
        raise Forbidden("not a member for this date")

    order = session.exec(
        select(DailyOrder).where(
            DailyOrder.event_id == ev.id,
            DailyOrder.user_id == user.id,
            DailyOrder.date == for_date,
        )
    ).first()

    is_explicit = order is not None
    rolled = False
    rolled_from_date: dt.date | None = None

    if not order and member.rollover_enabled:
        joined_date = member.joined_at.astimezone(tz).date()
        prev = session.exec(
            select(DailyOrder)
            .where(
                DailyOrder.event_id == ev.id,
                DailyOrder.user_id == user.id,
                DailyOrder.date < for_date,
                DailyOrder.date >= joined_date,
            )
            .order_by(DailyOrder.date.desc())
        ).first()
        if prev:
            order = prev
            rolled = True
            rolled_from_date = prev.date

    price_items = session.exec(select(PriceItem).where(PriceItem.event_id == ev.id)).all()
    active_ids = {str(pi.id) for pi in price_items if pi.active}
    meta = {
        str(pi.id): {
            "name": pi.name,
            "unit_price_minor": pi.unit_price_minor,
            "active": bool(pi.active),
        }
        for pi in price_items
    }

    enriched: list[OrderItemOut] = []
    grand_total = 0
    for it in order.items if order else []:
        pid = str(it.get("price_item_id"))
        qty = int(it.get("qty", 0))
        # Filter out inactive items from rolled orders
        if rolled and pid not in active_ids:
            continue
        m = meta.get(pid, {})
        unit = m.get("unit_price_minor")
        item_total = (qty * unit) if isinstance(unit, int) else None
        if isinstance(item_total, int):
            grand_total += item_total
        enriched.append(
            OrderItemOut(
                price_item_id=pid,
                qty=qty,
                name=m.get("name"),
                unit_price_minor=unit,
                item_total_minor=item_total,
                inactive=not bool(m.get("active", False)) if pid in meta else True,
            )
        )
    return OrderOut(
        event_id=ev.id,
        user_id=user.id,
        date=for_date,
        items=enriched,
        total_minor=grand_total,
        is_rolled_over=rolled,
        rolled_from_date=rolled_from_date,
        is_explicit=is_explicit,
    )


def aggregate_orders(
    session: Session, event_id: uuid.UUID, date: dt.date, user: User
) -> AggregateOut:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)

    orders = list(
        session.exec(
            select(DailyOrder).where(DailyOrder.event_id == ev.id, DailyOrder.date == date)
        ).all()
    )

    tz = _get_timezone(ev)
    mems = session.exec(select(Membership).where(Membership.event_id == ev.id)).all()
    active_user_ids: set[uuid.UUID] = set()
    joined_dates: dict[uuid.UUID, dt.date] = {}
    rollover_users: set[uuid.UUID] = set()
    for m in mems:
        jd = m.joined_at.astimezone(tz).date()
        ld = m.left_at.astimezone(tz).date() if m.left_at else None
        if date >= jd and (ld is None or date < ld):
            active_user_ids.add(m.user_id)
            joined_dates[m.user_id] = jd
            if m.rollover_enabled:
                rollover_users.add(m.user_id)

    have_order_ids = {o.user_id for o in orders}
    active_item_ids = set(
        session.exec(
            select(PriceItem.id).where(PriceItem.event_id == ev.id, PriceItem.active == True)  # noqa: E712
        ).all()
    )

    # Only rollover for users who have rollover enabled AND don't have an explicit order
    for uid in (active_user_ids & rollover_users) - have_order_ids:
        jd = joined_dates.get(uid)
        prev = session.exec(
            select(DailyOrder)
            .where(
                DailyOrder.event_id == ev.id,
                DailyOrder.user_id == uid,
                DailyOrder.date < date,
                *([DailyOrder.date >= jd] if jd else []),
            )
            .order_by(DailyOrder.date.desc())
        ).first()
        if prev:
            rolled_items = [
                it
                for it in (prev.items or [])
                if str(it.get("price_item_id")) in {str(x) for x in active_item_ids}
            ]
            if rolled_items:
                orders.append(
                    DailyOrder(event_id=ev.id, user_id=uid, date=date, items=rolled_items)
                )

    pi_rows = session.exec(select(PriceItem).where(PriceItem.event_id == ev.id)).all()
    meta = {
        str(pi.id): {"name": pi.name, "unit_price_minor": pi.unit_price_minor} for pi in pi_rows
    }

    # Filter out orders from inactive members (e.g. removed by admin)
    orders = [o for o in orders if o.user_id in active_user_ids]

    totals: dict[str, int] = {}
    consumers: dict[str, list[AggregateConsumerOut]] = {}
    for o in orders:
        for it in o.items:
            pid = str(it.get("price_item_id"))
            qty = int(it.get("qty", 0))
            totals[pid] = totals.get(pid, 0) + qty
            consumers.setdefault(pid, []).append(
                AggregateConsumerOut(user_id=str(o.user_id), qty=qty)
            )

    agg_items: list[AggregateItemOut] = []
    grand_total = 0
    for pid, qty in totals.items():
        m = meta.get(pid, {})
        unit = m.get("unit_price_minor")
        item_total = (qty * unit) if isinstance(unit, int) else None
        if isinstance(item_total, int):
            grand_total += item_total
        agg_items.append(
            AggregateItemOut(
                price_item_id=pid,
                name=m.get("name"),
                unit_price_minor=unit,
                item_total_minor=item_total,
                total_qty=qty,
                consumers=consumers.get(pid, []),
            )
        )
    return AggregateOut(date=date, total_minor=grand_total, items=agg_items)
