"""TypedDicts for JSONB fields stored in the database.

These types are used in service code to access JSONB data with type safety.
The SQLModel models keep `list[dict]` at the field level since SQLAlchemy
handles JSONB serialization; these TypedDicts are for annotating business logic.
"""

from typing import TypedDict


class OrderItemData(TypedDict):
    price_item_id: str  # UUID stored as string inside JSONB
    qty: int


class AllocationData(TypedDict):
    user_id: str  # UUID stored as string inside JSONB
    qty: int


class PurchaseLineData(TypedDict, total=False):
    type: str  # "price_item" | "custom"
    price_item_id: str | None
    name: str | None
    qty_final: int
    unit_price_minor: int
    reason: str | None  # "unavailable" | "substituted" | None
    allocations: list[AllocationData]
