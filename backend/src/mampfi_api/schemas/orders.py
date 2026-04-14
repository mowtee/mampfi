import datetime as dt
import uuid

from pydantic import BaseModel


class OrderItemIn(BaseModel):
    price_item_id: uuid.UUID
    qty: int


class OrderUpsertIn(BaseModel):
    date: dt.date
    items: list[OrderItemIn]


class OrderItemOut(BaseModel):
    price_item_id: str
    qty: int
    name: str | None = None
    unit_price_minor: int | None = None
    item_total_minor: int | None = None
    inactive: bool | None = None


class OrderOut(BaseModel):
    event_id: uuid.UUID
    user_id: uuid.UUID
    date: dt.date
    is_rolled_over: bool = False
    rolled_from_date: dt.date | None = None
    is_explicit: bool = False
    items: list[OrderItemOut]
    total_minor: int | None = None


class AggregateConsumerOut(BaseModel):
    user_id: str
    qty: int


class AggregateItemOut(BaseModel):
    price_item_id: str
    name: str | None = None
    unit_price_minor: int | None = None
    item_total_minor: int | None = None
    total_qty: int
    consumers: list[AggregateConsumerOut]


class AggregateOut(BaseModel):
    date: dt.date
    total_minor: int | None = None
    items: list[AggregateItemOut]
