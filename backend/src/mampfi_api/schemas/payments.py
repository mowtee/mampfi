import datetime as dt
import uuid

from pydantic import BaseModel, Field


class PaymentCreateIn(BaseModel):
    to_user_id: uuid.UUID
    amount_minor: int = Field(gt=0)
    note: str | None = Field(default=None, max_length=500)


class PaymentOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    amount_minor: int
    currency: str
    status: str
    note: str | None
    decline_reason: str | None = None
    created_at: dt.datetime
    decided_at: dt.datetime | None
    version: int


class DeclineIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class PaymentEventOut(BaseModel):
    id: uuid.UUID
    payment_id: uuid.UUID
    event_id: uuid.UUID
    event_type: str
    actor_id: uuid.UUID
    at: dt.datetime
    note: str | None = None
