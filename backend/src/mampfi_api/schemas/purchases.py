import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel, Field


class AllocationIn(BaseModel):
    user_id: str
    qty: int


class PurchaseLineIn(BaseModel):
    type: Literal["price_item", "custom"]
    price_item_id: uuid.UUID | None = None
    name: str | None = None
    qty_final: int
    unit_price_minor: int
    reason: str | None = None  # "unavailable" | "substituted" | None
    allocations: list[AllocationIn] | None = None


class PurchaseCreateIn(BaseModel):
    date: dt.date
    lines: list[PurchaseLineIn]
    notes: str | None = Field(default=None, max_length=2000)


class AllocationOut(BaseModel):
    user_id: str
    qty: int


class PurchaseLineOut(BaseModel):
    type: str
    price_item_id: str | None = None
    name: str | None = None
    qty_final: int
    unit_price_minor: int
    reason: str | None = None
    allocations: list[AllocationOut] | None = None


class InvalidatePurchaseIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class PurchaseOut(BaseModel):
    event_id: uuid.UUID
    date: dt.date
    buyer_id: uuid.UUID
    finalized_at: dt.datetime
    lines: list[PurchaseLineOut]
    total_minor: int
    notes: str | None = None
    invalidated_at: dt.datetime | None = None
    invalidated_by: uuid.UUID | None = None
    invalidation_reason: str | None = None
    has_receipt: bool = False
