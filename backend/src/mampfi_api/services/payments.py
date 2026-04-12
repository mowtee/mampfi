import uuid

from sqlmodel import Session, select

from ..exceptions import Conflict, DomainError, Forbidden, NotFound
from ..models import Event, Payment, PaymentEvent, User
from ..schemas.payments import DeclineIn, PaymentCreateIn, PaymentEventOut, PaymentOut
from ..services.events import require_member
from ..timeutils import now_utc


def _get_payment(session: Session, event_id: uuid.UUID, payment_id: uuid.UUID) -> Payment:
    p = session.get(Payment, payment_id)
    if not p or p.event_id != event_id:
        raise NotFound("payment")
    return p


def create_payment(
    session: Session, event_id: uuid.UUID, data: PaymentCreateIn, user: User
) -> PaymentOut:
    if data.amount_minor <= 0:
        raise DomainError("amount_minor must be > 0")
    if user.id == data.to_user_id:
        raise DomainError("cannot create a payment to yourself")

    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)
    require_member(session, ev.id, data.to_user_id)

    p = Payment(
        event_id=ev.id,
        from_user_id=user.id,
        to_user_id=data.to_user_id,
        amount_minor=int(data.amount_minor),
        currency=ev.currency,
        status="pending",
        note=data.note,
        created_at=now_utc(),
    )
    session.add(p)
    session.commit()
    session.refresh(p)
    session.add(
        PaymentEvent(
            payment_id=p.id,
            event_id=ev.id,
            event_type="created",
            actor_id=user.id,
            at=now_utc(),
            note=p.note,
        )
    )
    session.commit()
    session.refresh(p)
    return PaymentOut.model_validate(p, from_attributes=True)


def list_payments(
    session: Session,
    event_id: uuid.UUID,
    user: User,
    status_eq: str | None = None,
) -> list[PaymentOut]:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)

    stmt = select(Payment).where(Payment.event_id == ev.id)
    if status_eq:
        stmt = stmt.where(Payment.status == status_eq)
    return [PaymentOut.model_validate(i, from_attributes=True) for i in session.exec(stmt).all()]


def confirm_payment(
    session: Session, event_id: uuid.UUID, payment_id: uuid.UUID, user: User
) -> PaymentOut:
    now = now_utc()
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)
    p = _get_payment(session, ev.id, payment_id)
    if p.status != "pending":
        raise Conflict("payment not pending")
    if p.to_user_id != user.id:
        raise Forbidden("only recipient can confirm")
    p.status = "confirmed"
    p.decided_at = now
    p.version = (p.version or 1) + 1
    session.add(p)
    session.commit()
    session.add(
        PaymentEvent(
            payment_id=p.id, event_id=ev.id, event_type="confirmed", actor_id=user.id, at=now
        )
    )
    session.commit()
    session.refresh(p)
    return PaymentOut.model_validate(p, from_attributes=True)


def decline_payment(
    session: Session, event_id: uuid.UUID, payment_id: uuid.UUID, data: DeclineIn, user: User
) -> PaymentOut:
    now = now_utc()
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)
    p = _get_payment(session, ev.id, payment_id)
    if p.status != "pending":
        raise Conflict("payment not pending")
    if p.to_user_id != user.id:
        raise Forbidden("only recipient can decline")
    p.status = "declined"
    p.decided_at = now
    if data.reason:
        p.note = (p.note or "") + ("\n" if p.note else "") + f"decline: {data.reason}"
    p.version = (p.version or 1) + 1
    session.add(p)
    session.commit()
    session.add(
        PaymentEvent(
            payment_id=p.id,
            event_id=ev.id,
            event_type="declined",
            actor_id=user.id,
            at=now,
            note=data.reason,
        )
    )
    session.commit()
    session.refresh(p)
    return PaymentOut.model_validate(p, from_attributes=True)


def cancel_payment(
    session: Session, event_id: uuid.UUID, payment_id: uuid.UUID, user: User
) -> PaymentOut:
    now = now_utc()
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)
    p = _get_payment(session, ev.id, payment_id)
    if p.status != "pending":
        raise Conflict("payment not pending")
    if p.from_user_id != user.id:
        raise Forbidden("only proposer can cancel")
    p.status = "canceled"
    p.decided_at = now
    p.version = (p.version or 1) + 1
    session.add(p)
    session.commit()
    session.add(
        PaymentEvent(
            payment_id=p.id, event_id=ev.id, event_type="canceled", actor_id=user.id, at=now
        )
    )
    session.commit()
    session.refresh(p)
    return PaymentOut.model_validate(p, from_attributes=True)


def list_payment_events(
    session: Session, event_id: uuid.UUID, payment_id: uuid.UUID, user: User
) -> list[PaymentEventOut]:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    require_member(session, ev.id, user.id)
    p = _get_payment(session, ev.id, payment_id)
    events = session.exec(
        select(PaymentEvent).where(PaymentEvent.payment_id == p.id).order_by(PaymentEvent.at)
    ).all()
    return [PaymentEventOut.model_validate(e, from_attributes=True) for e in events]
