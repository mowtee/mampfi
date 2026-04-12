import datetime as dt
import uuid

from pydantic import BaseModel


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


class DeclineIn(BaseModel):
    reason: str | None = None


class PaymentEventOut(BaseModel):
    id: uuid.UUID
    payment_id: uuid.UUID
    event_id: uuid.UUID
    event_type: str
    actor_id: uuid.UUID
    at: dt.datetime
    note: str | None = None
