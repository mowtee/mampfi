import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlmodel import Session, select

from ..exceptions import DomainError, Forbidden, NotFound
from ..models import (
    DailyOrder,
    Event,
    InviteToken,
    Membership,
    Payment,
    PaymentEvent,
    PriceItem,
    Purchase,
    User,
)
from ..schemas.events import EventCreate, EventUpdate, EventWithMe, MemberOut, PriceItemAdd
from ..timeutils import now_utc


def require_member(session: Session, event_id: uuid.UUID, user_id: uuid.UUID) -> Membership:
    """Return the membership or raise Forbidden. Does not check for event existence."""
    m = session.get(Membership, (user_id, event_id))
    if not m:
        raise Forbidden("not a member of this event")
    return m


def require_owner(session: Session, event_id: uuid.UUID, user_id: uuid.UUID) -> Membership:
    m = session.get(Membership, (user_id, event_id))
    if not m or m.role != "owner":
        raise Forbidden("owner role required")
    return m


def get_event(session: Session, event_id: uuid.UUID) -> Event:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    return ev


def get_event_as_member(session: Session, event_id: uuid.UUID, user: User) -> Event:
    ev = get_event(session, event_id)
    require_member(session, ev.id, user.id)
    return ev


def validate_timezone(timezone: str) -> None:
    try:
        ZoneInfo(timezone)
    except ZoneInfoNotFoundError, KeyError:
        raise DomainError(f"unknown timezone: {timezone}") from None


def create_event(session: Session, data: EventCreate, user: User) -> Event:
    if data.start_date > data.end_date:
        raise DomainError("start_date must be <= end_date")
    cur = (data.currency or "").upper()
    if len(cur) != 3:
        raise DomainError("currency must be a 3-letter ISO code")
    validate_timezone(data.timezone)

    event = Event(
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        timezone=data.timezone,
        cutoff_time=data.cutoff_time,
        currency=cur,
        holiday_country_code=data.holiday_country_code or None,
        holiday_region_code=data.holiday_region_code or None,
    )
    session.add(event)
    session.flush()

    session.add(Membership(user_id=user.id, event_id=event.id, role="owner", joined_at=now_utc()))

    for item in data.price_items:
        session.add(
            PriceItem(
                event_id=event.id,
                name=item.name,
                unit_price_minor=item.unit_price_minor,
                active=True if item.active is None else item.active,
            )
        )
    session.commit()
    session.refresh(event)
    return event


def list_my_events(session: Session, user: User) -> list[EventWithMe]:
    mems = session.exec(select(Membership).where(Membership.user_id == user.id)).all()
    event_ids = [m.event_id for m in mems]
    events = session.exec(select(Event).where(Event.id.in_(event_ids))).all() if event_ids else []
    mem_by_event = {m.event_id: m for m in mems}
    out: list[EventWithMe] = []
    for ev in events:
        m = mem_by_event.get(ev.id)
        out.append(
            EventWithMe(
                id=ev.id,
                name=ev.name,
                description=ev.description,
                start_date=ev.start_date,
                end_date=ev.end_date,
                timezone=ev.timezone,
                cutoff_time=ev.cutoff_time,
                currency=ev.currency,
                holiday_country_code=ev.holiday_country_code,
                holiday_region_code=ev.holiday_region_code,
                delivery_fee_minor=ev.delivery_fee_minor,
                left_at=m.left_at if m else None,
                role=m.role if m else None,
            )
        )
    return out


def update_event(session: Session, event_id: uuid.UUID, data: EventUpdate, user: User) -> Event:
    ev = get_event(session, event_id)
    require_owner(session, ev.id, user.id)
    if data.holiday_country_code is not None:
        ev.holiday_country_code = data.holiday_country_code or None
    if data.holiday_region_code is not None:
        ev.holiday_region_code = data.holiday_region_code or None
    if data.cutoff_time is not None:
        ev.cutoff_time = data.cutoff_time
    if data.delivery_fee_minor is not None:
        ev.delivery_fee_minor = data.delivery_fee_minor if data.delivery_fee_minor > 0 else None
    session.add(ev)
    session.commit()
    session.refresh(ev)
    return ev


def list_price_items(
    session: Session, event_id: uuid.UUID, user: User, include_inactive: bool = False
) -> list[PriceItem]:
    ev = get_event(session, event_id)
    require_member(session, ev.id, user.id)
    stmt = select(PriceItem).where(PriceItem.event_id == ev.id)
    if not include_inactive:
        stmt = stmt.where(PriceItem.active == True)  # noqa: E712
    return list(session.exec(stmt).all())


def add_price_item(
    session: Session, event_id: uuid.UUID, data: PriceItemAdd, user: User
) -> PriceItem:
    if data.unit_price_minor <= 0:
        raise DomainError("unit_price_minor must be > 0")
    ev = get_event(session, event_id)
    require_member(session, ev.id, user.id)
    require_owner(session, ev.id, user.id)
    item = PriceItem(
        event_id=ev.id,
        name=data.name,
        unit_price_minor=int(data.unit_price_minor),
        active=True,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def _set_price_item_active(
    session: Session, event_id: uuid.UUID, price_item_id: uuid.UUID, user: User, *, active: bool
) -> None:
    ev = get_event(session, event_id)
    require_owner(session, ev.id, user.id)
    item = session.get(PriceItem, price_item_id)
    if not item or item.event_id != ev.id:
        raise NotFound("price item")
    item.active = active
    session.add(item)
    session.commit()


def deactivate_price_item(
    session: Session, event_id: uuid.UUID, price_item_id: uuid.UUID, user: User
) -> None:
    _set_price_item_active(session, event_id, price_item_id, user, active=False)


def activate_price_item(
    session: Session, event_id: uuid.UUID, price_item_id: uuid.UUID, user: User
) -> None:
    _set_price_item_active(session, event_id, price_item_id, user, active=True)


def list_members(session: Session, event_id: uuid.UUID, user: User) -> list[MemberOut]:
    ev = get_event(session, event_id)
    require_member(session, ev.id, user.id)
    mems = session.exec(select(Membership).where(Membership.event_id == ev.id)).all()
    user_ids = [m.user_id for m in mems]
    users = {}
    if user_ids:
        for u in session.exec(select(User).where(User.id.in_(user_ids))).all():
            users[u.id] = u
    return [
        MemberOut(
            user_id=m.user_id,
            email=(users[m.user_id].email if m.user_id in users else None),
            name=(users[m.user_id].name if m.user_id in users else None),
            role=m.role,
            joined_at=m.joined_at,
            left_at=m.left_at,
            banned_at=m.banned_at,
            rollover_enabled=m.rollover_enabled,
            note=m.note,
        )
        for m in mems
    ]


def delete_event(session: Session, event_id: uuid.UUID, user: User) -> None:
    """Delete an event and all related data. Owner only."""
    ev = get_event(session, event_id)
    require_owner(session, ev.id, user.id)

    # Collect member info before deletion for notifications
    from ..services.balances import compute_balances

    mems = session.exec(select(Membership).where(Membership.event_id == ev.id)).all()
    balances = compute_balances(session, ev.id)
    deleter_name = user.name or user.email

    # Delete all related data
    for model in [PaymentEvent, Payment, Purchase, DailyOrder, PriceItem, InviteToken, Membership]:
        rows = session.exec(select(model).where(model.event_id == ev.id)).all()
        for row in rows:
            session.delete(row)

    session.delete(ev)
    session.flush()

    # Build balance summary for emails
    all_users = {m.user_id: session.get(User, m.user_id) for m in mems}
    all_settled = all(abs(balances.get(m.user_id, 0)) == 0 for m in mems)
    balance_lines: list[str] = []
    for m in mems:
        u = all_users.get(m.user_id)
        name = (u.name or u.email) if u else str(m.user_id)
        bal = balances.get(m.user_id, 0)
        balance_lines.append(f"  {name}: {bal / 100:.2f} {ev.currency}")
    balance_summary = "\n".join(balance_lines)

    # Enqueue notification emails to ALL members (including deleter)
    from ..config import get_settings
    from ..i18n import get_lang, t
    from ..services.email import _logo_url, _render
    from ..services.email import enqueue_email as _enqueue

    frontend_url = get_settings().frontend_url

    for m in mems:
        member_user = all_users.get(m.user_id)
        if not member_user:
            continue
        lang = get_lang(member_user.locale)
        if all_settled:
            status_text = t("event_deleted_settled", lang)
        else:
            status_text = t("event_deleted_balances", lang)
        subject = t("event_deleted_subject", lang, event_name=ev.name)
        body_text = t(
            "event_deleted_body",
            lang,
            event_name=ev.name,
            deleter=deleter_name,
            status=status_text,
        )
        ctx = dict(
            lang=lang,
            logo_url=_logo_url(frontend_url),
            greeting=t("greeting", lang),
            name=member_user.name or member_user.email,
            body=body_text,
            balance_lines=balance_summary if not all_settled else "",
        )
        _enqueue(
            session,
            member_user.email,
            subject,
            _render("email/event_deleted.html", **ctx),
            _render("email/event_deleted.txt", **ctx),
        )

    session.commit()
