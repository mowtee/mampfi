import datetime as dt
import uuid

from sqlmodel import Session, select

from ..exceptions import Conflict, DomainError, NotFound
from ..models import Event, PriceItem, Purchase, User
from ..schemas.purchases import PurchaseCreateIn, PurchaseOut
from ..services.events import require_member
from ..timeutils import now_utc


def finalize_purchase(
    session: Session, event_id: uuid.UUID, data: PurchaseCreateIn, user: User
) -> PurchaseOut:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)

    existing = session.exec(
        select(Purchase).where(Purchase.event_id == ev.id, Purchase.date == data.date)
    ).first()
    if existing:
        raise Conflict("purchase already finalized for this date")

    price_item_ids = set(
        session.exec(select(PriceItem.id).where(PriceItem.event_id == ev.id)).all()
    )

    normalized_lines: list[dict] = []
    total_minor = 0
    for raw in data.lines:
        t = raw.type
        qty = int(raw.qty_final)
        unit = int(raw.unit_price_minor)
        if qty < 0 or unit < 0:
            raise DomainError("qty and unit_price must be >= 0")
        if t == "price_item":
            if raw.price_item_id not in price_item_ids:
                raise DomainError(f"unknown price_item_id {raw.price_item_id}")
        elif t == "custom":
            if not raw.name:
                raise DomainError("custom line requires name")
        else:
            raise DomainError("invalid line type")

        allocs = list(raw.allocations or [])
        alloc_sum = sum(int(a.qty) for a in allocs)
        if any(int(a.qty) < 0 for a in allocs):
            raise DomainError("allocation qty must be >= 0")
        if alloc_sum != qty:
            raise DomainError("allocations qty must sum to qty_final")

        total_minor += qty * unit
        normalized_lines.append(
            {
                "type": t,
                "price_item_id": str(raw.price_item_id) if raw.price_item_id is not None else None,
                "name": raw.name,
                "qty_final": qty,
                "unit_price_minor": unit,
                "reason": raw.reason,
                "allocations": [a.model_dump() for a in allocs],
            }
        )

    purchase = Purchase(
        event_id=ev.id,
        date=data.date,
        buyer_id=user.id,
        finalized_at=now_utc(),
        lines=normalized_lines,
        total_minor=total_minor,
        notes=data.notes,
    )
    session.add(purchase)
    session.commit()
    session.refresh(purchase)
    return PurchaseOut.model_validate(purchase, from_attributes=True)


def get_purchase(
    session: Session, event_id: uuid.UUID, for_date: dt.date, user: User
) -> PurchaseOut:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)

    purchase = session.exec(
        select(Purchase).where(Purchase.event_id == ev.id, Purchase.date == for_date)
    ).first()
    if not purchase:
        raise NotFound("purchase")
    return PurchaseOut.model_validate(purchase, from_attributes=True)


def list_purchases(
    session: Session,
    event_id: uuid.UUID,
    user: User,
    start_date: dt.date | None = None,
    end_date: dt.date | None = None,
) -> list[PurchaseOut]:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)

    stmt = select(Purchase).where(Purchase.event_id == ev.id)
    if start_date is not None:
        stmt = stmt.where(Purchase.date >= start_date)
    if end_date is not None:
        stmt = stmt.where(Purchase.date <= end_date)
    stmt = stmt.order_by(Purchase.date.desc(), Purchase.finalized_at.desc())

    return [PurchaseOut.model_validate(p, from_attributes=True) for p in session.exec(stmt).all()]
