import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, status

from ..auth import get_current_user
from ..db import get_session
from ..models import User
from ..schemas.payments import DeclineIn, PaymentCreateIn, PaymentEventOut, PaymentOut
from ..services import payments as svc

router = APIRouter(prefix="/v1/events/{event_id}/payments", tags=["payments"])


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    event_id: uuid.UUID, data: PaymentCreateIn, user: User = Depends(get_current_user)
) -> PaymentOut:
    with get_session() as session:
        return svc.create_payment(session, event_id, data, user)


@router.get("", response_model=list[PaymentOut])
def list_payments(
    event_id: uuid.UUID,
    status_eq: Literal["pending", "confirmed", "declined", "canceled"] | None = Query(
        default=None, alias="status"
    ),
    user: User = Depends(get_current_user),
) -> list[PaymentOut]:
    with get_session() as session:
        return svc.list_payments(session, event_id, user, status_eq)


@router.post("/{payment_id}/confirm", response_model=PaymentOut)
def confirm_payment(
    event_id: uuid.UUID, payment_id: uuid.UUID, user: User = Depends(get_current_user)
) -> PaymentOut:
    with get_session() as session:
        return svc.confirm_payment(session, event_id, payment_id, user)


@router.post("/{payment_id}/decline", response_model=PaymentOut)
def decline_payment(
    event_id: uuid.UUID,
    payment_id: uuid.UUID,
    data: DeclineIn,
    user: User = Depends(get_current_user),
) -> PaymentOut:
    with get_session() as session:
        return svc.decline_payment(session, event_id, payment_id, data, user)


@router.post("/{payment_id}/cancel", response_model=PaymentOut)
def cancel_payment(
    event_id: uuid.UUID, payment_id: uuid.UUID, user: User = Depends(get_current_user)
) -> PaymentOut:
    with get_session() as session:
        return svc.cancel_payment(session, event_id, payment_id, user)


@router.get("/{payment_id}/events", response_model=list[PaymentEventOut])
def list_payment_events(
    event_id: uuid.UUID, payment_id: uuid.UUID, user: User = Depends(get_current_user)
) -> list[PaymentEventOut]:
    with get_session() as session:
        return svc.list_payment_events(session, event_id, payment_id, user)
