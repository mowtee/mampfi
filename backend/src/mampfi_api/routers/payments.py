from __future__ import annotations

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import select

from ..auth import get_current_user
from ..db import get_session
from ..models import Event, Membership, Payment, PaymentEvent, User
from ..timeutils import now_utc

router = APIRouter(prefix="/v1/events/{event_id}/payments", tags=["payments"])


class PaymentCreateIn(BaseModel):
    to_user_id: uuid.UUID
    amount_minor: int
    note: str | None = None


class PaymentOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    amount_minor: int
    currency: str
    status: str
    note: str | None
    created_at: dt.datetime
    decided_at: dt.datetime | None
    version: int


def _ensure_member(session, event_id: uuid.UUID, user_id: uuid.UUID) -> Membership:
    m = session.get(Membership, (user_id, event_id))
    if not m:
        raise HTTPException(status_code=403, detail="not a member of this event")
    return m


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    event_id: uuid.UUID, data: PaymentCreateIn, user: User = Depends(get_current_user)
) -> PaymentOut:
    if data.amount_minor <= 0:
        raise HTTPException(status_code=400, detail="amount_minor must be > 0")
    if user.id == data.to_user_id:
        raise HTTPException(status_code=400, detail="cannot create a payment to yourself")

    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        _ensure_member(session, ev.id, user.id)
        _ensure_member(session, ev.id, data.to_user_id)

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
        # audit
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


@router.get("", response_model=list[PaymentOut])
def list_payments(
    event_id: uuid.UUID,
    status_eq: Literal["pending", "confirmed", "declined", "canceled"] | None = Query(
        default=None, alias="status"
    ),
    user: User = Depends(get_current_user),
) -> list[PaymentOut]:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        _ensure_member(session, ev.id, user.id)
        stmt = select(Payment).where(Payment.event_id == ev.id)
        if status_eq:
            stmt = stmt.where(Payment.status == status_eq)
        items = session.exec(stmt).all()
        return [PaymentOut.model_validate(i, from_attributes=True) for i in items]


def _get_payment(session, event_id: uuid.UUID, payment_id: uuid.UUID) -> Payment:
    p = session.get(Payment, payment_id)
    if not p or p.event_id != event_id:
        raise HTTPException(status_code=404, detail="payment not found")
    return p


@router.post("/{payment_id}/confirm", response_model=PaymentOut)
def confirm_payment(
    event_id: uuid.UUID, payment_id: uuid.UUID, user: User = Depends(get_current_user)
) -> PaymentOut:
    now = now_utc()
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        _ensure_member(session, ev.id, user.id)
        p = _get_payment(session, ev.id, payment_id)
        if p.status != "pending":
            raise HTTPException(status_code=400, detail="payment not pending")
        if p.to_user_id != user.id:
            raise HTTPException(status_code=403, detail="only recipient can confirm")
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


class DeclineIn(BaseModel):
    reason: str | None = None


@router.post("/{payment_id}/decline", response_model=PaymentOut)
def decline_payment(
    event_id: uuid.UUID,
    payment_id: uuid.UUID,
    data: DeclineIn,
    user: User = Depends(get_current_user),
) -> PaymentOut:
    now = now_utc()
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        _ensure_member(session, ev.id, user.id)
        p = _get_payment(session, ev.id, payment_id)
        if p.status != "pending":
            raise HTTPException(status_code=400, detail="payment not pending")
        if p.to_user_id != user.id:
            raise HTTPException(status_code=403, detail="only recipient can decline")
        p.status = "declined"
        p.decided_at = now
        # keep proposer note + reason if provided
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


@router.post("/{payment_id}/cancel", response_model=PaymentOut)
def cancel_payment(
    event_id: uuid.UUID, payment_id: uuid.UUID, user: User = Depends(get_current_user)
) -> PaymentOut:
    now = now_utc()
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        _ensure_member(session, ev.id, user.id)
        p = _get_payment(session, ev.id, payment_id)
        if p.status != "pending":
            raise HTTPException(status_code=400, detail="payment not pending")
        if p.from_user_id != user.id:
            raise HTTPException(status_code=403, detail="only proposer can cancel")
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


class PaymentEventOut(BaseModel):
    id: uuid.UUID
    payment_id: uuid.UUID
    event_id: uuid.UUID
    event_type: str
    actor_id: uuid.UUID
    at: dt.datetime
    note: str | None = None


@router.get("/{payment_id}/events", response_model=list[PaymentEventOut])
def list_payment_events(
    event_id: uuid.UUID, payment_id: uuid.UUID, user: User = Depends(get_current_user)
) -> list[PaymentEventOut]:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        _ensure_member(session, ev.id, user.id)
        p = _get_payment(session, ev.id, payment_id)
        events = session.exec(
            select(PaymentEvent).where(PaymentEvent.payment_id == p.id).order_by(PaymentEvent.at)
        ).all()
        return [PaymentEventOut.model_validate(e, from_attributes=True) for e in events]


# balances endpoint moved to dedicated router under /v1/events/{event_id}/balances
