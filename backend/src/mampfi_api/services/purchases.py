import datetime as dt
import uuid

from sqlmodel import Session, select

from ..config import get_settings
from ..exceptions import Conflict, DomainError, NotFound
from ..models import Event, PriceItem, Purchase, User
from ..schemas.purchases import (
    DeliveryFeeShare,
    InvalidatePurchaseIn,
    PurchaseCreateIn,
    PurchaseOut,
)
from ..services.email import notify_purchase_finalized
from ..services.memberships import require_member, require_owner
from ..timeutils import now_utc


def _purchase_out(p: Purchase, event_fee: int = 0) -> PurchaseOut:
    out = PurchaseOut.model_validate(p, from_attributes=True)
    out.has_receipt = bool(p.receipt_data)

    if p.delivery_fee_applied and event_fee > 0:
        # Collect members who received items, excluding buyer
        members: set[str] = set()
        for line in p.lines or []:
            for alloc in line.get("allocations") or []:
                qty = int(alloc.get("qty") or 0)
                if qty > 0:
                    members.add(str(alloc.get("user_id")))
        members.discard(str(p.buyer_id))

        if members:
            fee_per = event_fee // len(members)
            remainder = event_fee - fee_per * len(members)
            shares = []
            for i, uid in enumerate(sorted(members)):
                share = fee_per + (1 if i < remainder else 0)
                shares.append(DeliveryFeeShare(user_id=uid, amount_minor=share))
            out.delivery_fee_shares = shares

    return out


def finalize_purchase(
    session: Session, event_id: uuid.UUID, data: PurchaseCreateIn, user: User
) -> PurchaseOut:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)

    if data.date > dt.date.today():
        raise DomainError("cannot finalize a purchase for a future date")

    existing = session.exec(
        select(Purchase).where(
            Purchase.event_id == ev.id,
            Purchase.date == data.date,
            Purchase.invalidated_at.is_(None),  # type: ignore[union-attr]
        )
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

    # Apply delivery fee if event has one configured and buyer opted in
    delivery_fee_applied = False
    if data.delivery_fee_applied and ev.delivery_fee_minor and ev.delivery_fee_minor > 0:
        total_minor += ev.delivery_fee_minor
        delivery_fee_applied = True

    purchase = Purchase(
        event_id=ev.id,
        date=data.date,
        buyer_id=user.id,
        finalized_at=now_utc(),
        lines=normalized_lines,
        total_minor=total_minor,
        notes=data.notes,
        delivery_fee_applied=delivery_fee_applied,
    )
    session.add(purchase)
    session.commit()
    session.refresh(purchase)

    # Notify members who have allocations
    settings = get_settings()
    notified: set[uuid.UUID] = set()
    for line in normalized_lines:
        for alloc in line.get("allocations") or []:
            uid_str = alloc.get("user_id")
            if not uid_str:
                continue
            try:
                uid = uuid.UUID(str(uid_str))
            except ValueError:
                continue
            if uid in notified or uid == user.id:
                continue
            recipient = session.get(User, uid)
            if recipient:
                notify_purchase_finalized(
                    session,
                    recipient,
                    user,
                    ev,
                    str(data.date),
                    f"{total_minor / 100:.2f} {ev.currency}",
                    settings.frontend_url,
                )
                notified.add(uid)
    if notified:
        session.commit()

    return _purchase_out(purchase, int(ev.delivery_fee_minor or 0))


def get_purchase(
    session: Session, event_id: uuid.UUID, for_date: dt.date, user: User
) -> PurchaseOut:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)

    purchase = session.exec(
        select(Purchase)
        .where(Purchase.event_id == ev.id, Purchase.date == for_date)
        .order_by(Purchase.finalized_at.desc())
    ).first()
    if not purchase:
        raise NotFound("purchase")
    return _purchase_out(purchase, int(ev.delivery_fee_minor or 0))


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

    fee = int(ev.delivery_fee_minor or 0)
    return [_purchase_out(p, fee) for p in session.exec(stmt).all()]


def invalidate_purchase(
    session: Session,
    event_id: uuid.UUID,
    for_date: dt.date,
    data: InvalidatePurchaseIn,
    user: User,
) -> PurchaseOut:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_owner(session, ev.id, user.id)

    purchase = session.exec(
        select(Purchase).where(
            Purchase.event_id == ev.id,
            Purchase.date == for_date,
            Purchase.invalidated_at.is_(None),  # type: ignore[union-attr]
        )
    ).first()
    if not purchase:
        raise NotFound("active purchase for this date")

    purchase.invalidated_at = now_utc()
    purchase.invalidated_by = user.id
    purchase.invalidation_reason = data.reason
    session.add(purchase)
    session.commit()
    session.refresh(purchase)
    return _purchase_out(purchase, int(ev.delivery_fee_minor or 0))


MAX_RECEIPT_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def upload_receipt(
    session: Session,
    event_id: uuid.UUID,
    for_date: dt.date,
    data: bytes,
    content_type: str,
    user: User,
) -> PurchaseOut:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)

    if content_type not in ALLOWED_CONTENT_TYPES:
        raise DomainError(f"unsupported image format: {content_type}")
    if len(data) > MAX_RECEIPT_SIZE:
        raise DomainError("image too large (max 10 MB)")

    import base64

    purchase = session.exec(
        select(Purchase).where(
            Purchase.event_id == ev.id,
            Purchase.date == for_date,
            Purchase.invalidated_at.is_(None),  # type: ignore[union-attr]
        )
    ).first()
    if not purchase:
        raise NotFound("purchase")

    purchase.receipt_data = f"data:{content_type};base64,{base64.b64encode(data).decode()}"
    session.add(purchase)
    session.commit()
    session.refresh(purchase)
    return _purchase_out(purchase, int(ev.delivery_fee_minor or 0))


def get_receipt(session: Session, event_id: uuid.UUID, for_date: dt.date, user: User) -> str:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)

    purchase = session.exec(
        select(Purchase)
        .where(Purchase.event_id == ev.id, Purchase.date == for_date)
        .order_by(Purchase.finalized_at.desc())
    ).first()
    if not purchase or not purchase.receipt_data:
        raise NotFound("receipt")
    return purchase.receipt_data
