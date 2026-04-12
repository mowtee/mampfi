from __future__ import annotations

import datetime as dt
import uuid
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import select

from ..auth import get_current_user
from ..db import get_session
from ..models import DailyOrder, Event, Membership, PriceItem, Purchase, User

router = APIRouter(prefix="/v1/events/{event_id}/orders", tags=["orders"])


class OrderItemIn(BaseModel):
    price_item_id: uuid.UUID
    qty: int


class OrderUpsertIn(BaseModel):
    date: dt.date
    items: list[OrderItemIn]


def _cutoff_has_passed_for_date(
    ev: Event, target_date: dt.date, now_utc: dt.datetime | None = None
) -> bool:
    """Return True if the cutoff for the given target_date has passed.

    Per requirements: the next day's orders lock at the daily cutoff. That means the cutoff
    for target_date occurs at (target_date - 1) at event.cutoff_time in the event timezone.
    """
    if now_utc is None:
        now_utc = dt.datetime.now(dt.UTC)
    try:
        tz = ZoneInfo(ev.timezone)
    except Exception:
        raise HTTPException(status_code=500, detail="Invalid event timezone") from None
    cutoff_local = dt.datetime.combine(target_date - dt.timedelta(days=1), ev.cutoff_time).replace(
        tzinfo=tz
    )
    cutoff_utc = cutoff_local.astimezone(dt.UTC)
    return now_utc >= cutoff_utc


@router.put("/{for_date}/me", status_code=status.HTTP_200_OK)
def upsert_my_order(
    event_id: uuid.UUID,
    for_date: dt.date,
    data: OrderUpsertIn,
    user: User = Depends(get_current_user),
) -> dict:
    # Consistency: path date must match body date
    if data.date != for_date:
        raise HTTPException(status_code=400, detail="path date and body date must match")

    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")

        # Validate date within event window
        if for_date < ev.start_date or for_date > ev.end_date:
            raise HTTPException(status_code=400, detail="date outside event window")

        # Enforce membership active for the target date (joined_at <= date < left_at)
        try:
            tz = ZoneInfo(ev.timezone)
        except Exception:
            raise HTTPException(status_code=500, detail="Invalid event timezone") from None
        joined_date = member.joined_at.astimezone(tz).date()
        left_date = member.left_at.astimezone(tz).date() if member.left_at else None
        active_on_date = (for_date >= joined_date) and (left_date is None or for_date < left_date)
        if not active_on_date:
            raise HTTPException(status_code=403, detail="not a member for this date")

        # Enforce cutoff locking for the target date
        if _cutoff_has_passed_for_date(ev, for_date):
            raise HTTPException(
                status_code=403, detail="orders locked for this date (cutoff passed)"
            )

        # Block changes if purchase already finalized for this date
        if session.exec(
            select(Purchase).where(Purchase.event_id == ev.id, Purchase.date == for_date)
        ).first():
            raise HTTPException(
                status_code=403, detail="orders locked: purchase already finalized for this date"
            )

        # Validate items (only active items are valid for ordering)
        active_item_ids = set(
            session.exec(
                select(PriceItem.id).where(PriceItem.event_id == ev.id, PriceItem.active == True)  # noqa: E712
            ).all()
        )
        all_item_ids = set(
            session.exec(select(PriceItem.id).where(PriceItem.event_id == ev.id)).all()
        )
        norm_items: list[dict] = []
        inactive_ids: list[str] = []
        unknown_ids: list[str] = []
        if len(data.items) == 0:
            # Allow empty list to mean "no order"
            pass
        for it in data.items:
            if it.qty < 0:
                raise HTTPException(status_code=400, detail="qty must be >= 0")
            pid = it.price_item_id
            if pid not in all_item_ids:
                unknown_ids.append(str(pid))
                continue
            if pid not in active_item_ids:
                inactive_ids.append(str(pid))
                continue
            norm_items.append({"price_item_id": str(it.price_item_id), "qty": int(it.qty)})

        if inactive_ids or unknown_ids:
            raise HTTPException(
                status_code=400,
                detail={"inactive_item_ids": inactive_ids, "unknown_item_ids": unknown_ids},
            )

        # Upsert
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
            session.add(
                DailyOrder(
                    event_id=ev.id,
                    user_id=user.id,
                    date=for_date,
                    items=norm_items,
                )
            )
        session.commit()
        return {"status": "ok"}


class OrderOut(BaseModel):
    event_id: uuid.UUID
    user_id: uuid.UUID
    date: dt.date
    is_rolled_over: bool | None = None

    # Enriched items: include name and unit price for convenience
    class OrderItemOut(BaseModel):
        price_item_id: str
        qty: int
        name: str | None = None
        unit_price_minor: int | None = None
        item_total_minor: int | None = None
        inactive: bool | None = None

    items: list[OrderItemOut]
    total_minor: int | None = None


@router.get("/{for_date}/me", response_model=OrderOut)
def get_my_order(
    event_id: uuid.UUID, for_date: dt.date, user: User = Depends(get_current_user)
) -> OrderOut:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")

        # Membership activity by date using event timezone
        try:
            tz = ZoneInfo(ev.timezone)
        except Exception:
            raise HTTPException(status_code=500, detail="Invalid event timezone") from None
        joined_date = member.joined_at.astimezone(tz).date()
        left_date = member.left_at.astimezone(tz).date() if member.left_at else None
        active_on_date = (for_date >= joined_date) and (left_date is None or for_date < left_date)
        if not active_on_date:
            raise HTTPException(status_code=403, detail="not a member for this date")

        order = session.exec(
            select(DailyOrder).where(
                DailyOrder.event_id == ev.id,
                DailyOrder.user_id == user.id,
                DailyOrder.date == for_date,
            )
        ).first()

        rolled = False
        if not order:
            # Find the most recent prior explicit order within membership window
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

        # Enrich with item names and unit prices; no writes for rollover
        price_items = session.exec(select(PriceItem).where(PriceItem.event_id == ev.id)).all()
        meta = {
            str(pi.id): {
                "name": pi.name,
                "unit_price_minor": pi.unit_price_minor,
                "active": bool(pi.active),
            }
            for pi in price_items
        }
        enriched: list[OrderOut.OrderItemOut] = []
        grand_total = 0
        for it in order.items if order else []:
            pid = str(it.get("price_item_id"))
            qty = int(it.get("qty", 0))
            m = meta.get(pid, {})
            unit = m.get("unit_price_minor")
            item_total = (qty * unit) if isinstance(unit, int) else None
            if isinstance(item_total, int):
                grand_total += item_total
            enriched.append(
                OrderOut.OrderItemOut(
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
            is_rolled_over=(rolled or None),
        )


class AggregateOut(BaseModel):
    date: dt.date
    total_minor: int | None = None
    items: list[dict]


@router.get("/aggregate", response_model=AggregateOut)
def aggregate_orders(
    event_id: uuid.UUID,
    date: dt.date = Query(..., alias="date"),
    user: User = Depends(get_current_user),
) -> AggregateOut:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        if not session.get(Membership, (user.id, ev.id)):
            raise HTTPException(status_code=403, detail="not a member of this event")
        # Start with explicit orders for the date
        orders = session.exec(
            select(DailyOrder).where(DailyOrder.event_id == ev.id, DailyOrder.date == date)
        ).all()

        # Determine active memberships for the date (joined_at <= date < left_at in event TZ)
        try:
            tz = ZoneInfo(ev.timezone)
        except Exception:
            raise HTTPException(status_code=500, detail="Invalid event timezone") from None
        mems = session.exec(select(Membership).where(Membership.event_id == ev.id)).all()
        active_user_ids: set[uuid.UUID] = set()
        joined_dates: dict[uuid.UUID, dt.date] = {}
        for m in mems:
            jd = m.joined_at.astimezone(tz).date()
            ld = m.left_at.astimezone(tz).date() if m.left_at else None
            if date >= jd and (ld is None or date < ld):
                active_user_ids.add(m.user_id)
                joined_dates[m.user_id] = jd

        # Users who already have explicit orders on this date
        have_order_ids = {o.user_id for o in orders}

        # Active items (only these are valid for intended orders)
        active_item_ids = set(
            session.exec(
                select(PriceItem.id).where(PriceItem.event_id == ev.id, PriceItem.active == True)  # noqa: E712
            ).all()
        )

        # For active users without an explicit order, roll over their most recent prior explicit order
        for uid in active_user_ids - have_order_ids:
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
                # Create a lightweight view object with items filtered to active price items
                rolled_items = [
                    it
                    for it in (prev.items or [])
                    if str(it.get("price_item_id")) in {str(x) for x in active_item_ids}
                ]
                if rolled_items:
                    orders.append(
                        DailyOrder(
                            event_id=ev.id,
                            user_id=uid,
                            date=date,
                            items=rolled_items,
                        )
                    )
        # Load price item metadata for enrichment
        # Include all price items (active or inactive) for metadata so that
        # deactivated items already present in saved orders are still displayed with names/prices
        pi_rows = session.exec(select(PriceItem).where(PriceItem.event_id == ev.id)).all()
        meta = {
            str(pi.id): {"name": pi.name, "unit_price_minor": pi.unit_price_minor} for pi in pi_rows
        }
        # Aggregate totals and consumers
        totals: dict[str, int] = {}
        consumers: dict[str, list[dict]] = {}
        for o in orders:
            for it in o.items:
                pid = str(it.get("price_item_id"))
                qty = int(it.get("qty", 0))
                totals[pid] = totals.get(pid, 0) + qty
                consumers.setdefault(pid, []).append({"user_id": str(o.user_id), "qty": qty})
        agg_items = []
        grand_total = 0
        for pid, qty in totals.items():
            m = meta.get(pid, {})
            unit = m.get("unit_price_minor")
            item_total = (qty * unit) if isinstance(unit, int) else None
            if isinstance(item_total, int):
                grand_total += item_total
            agg_items.append(
                {
                    "price_item_id": pid,
                    "name": m.get("name"),
                    "unit_price_minor": unit,
                    "item_total_minor": item_total,
                    "total_qty": qty,
                    "consumers": consumers.get(pid, []),
                }
            )
        return AggregateOut(date=date, total_minor=grand_total, items=agg_items)
