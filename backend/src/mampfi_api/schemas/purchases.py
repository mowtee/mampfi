import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel


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
    notes: str | None = None


class PurchaseOut(BaseModel):
    event_id: uuid.UUID
    date: dt.date
    buyer_id: uuid.UUID
    finalized_at: dt.datetime
    lines: list[dict]
    total_minor: int
    notes: str | None = None
