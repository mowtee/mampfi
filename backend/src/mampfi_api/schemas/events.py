import datetime as dt
import uuid

from pydantic import BaseModel


class EventCreate(BaseModel):
    name: str
    description: str | None = None
    start_date: dt.date
    end_date: dt.date
    timezone: str
    cutoff_time: dt.time
    currency: str
    price_items: list[PriceItemCreate]
    holiday_country_code: str | None = None
    holiday_region_code: str | None = None


class PriceItemCreate(BaseModel):
    name: str
    unit_price_minor: int
    active: bool | None = True


class EventUpdate(BaseModel):
    holiday_country_code: str | None = None
    holiday_region_code: str | None = None


class EventWithMe(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    start_date: dt.date
    end_date: dt.date
    timezone: str
    cutoff_time: dt.time
    currency: str
    holiday_country_code: str | None = None
    holiday_region_code: str | None = None
    left_at: dt.datetime | None = None


class PriceItemAdd(BaseModel):
    name: str
    unit_price_minor: int


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str | None = None
    name: str | None = None
    role: str
    joined_at: dt.datetime
    left_at: dt.datetime | None = None
