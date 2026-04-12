import datetime as dt
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator


class PriceItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    unit_price_minor: int = Field(gt=0)
    active: bool | None = True


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    start_date: dt.date
    end_date: dt.date
    timezone: str = Field(min_length=1, max_length=60)
    cutoff_time: dt.time
    currency: str = Field(min_length=3, max_length=3)
    price_items: list[PriceItemCreate]
    holiday_country_code: str | None = Field(default=None, max_length=10)
    holiday_region_code: str | None = Field(default=None, max_length=20)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except ZoneInfoNotFoundError, KeyError:
            raise ValueError(f"unknown IANA timezone: {v}") from None
        return v

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v: dt.date, info) -> dt.date:
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date must be >= start_date")
        return v


class EventUpdate(BaseModel):
    holiday_country_code: str | None = Field(default=None, max_length=10)
    holiday_region_code: str | None = Field(default=None, max_length=20)


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
    name: str = Field(min_length=1, max_length=200)
    unit_price_minor: int = Field(gt=0)


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str | None = None
    name: str | None = None
    role: str
    joined_at: dt.datetime
    left_at: dt.datetime | None = None
