import datetime as dt
import uuid

from sqlalchemy import JSON, Column
from sqlalchemy import DateTime as SADateTime
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlmodel import Field, SQLModel

from .timeutils import now_utc

# JSONB on PostgreSQL, plain JSON on SQLite (tests).
PgJSON = JSONB().with_variant(JSON(), "sqlite")


def uuid_pk() -> uuid.UUID:
    return uuid.uuid7()


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid_pk, sa_type=UUID(as_uuid=True), primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str | None = None
    locale: str | None = None
    created_at: dt.datetime = Field(
        default_factory=now_utc,
        sa_column=Column(SADateTime(timezone=True), nullable=False),
    )


class Event(SQLModel, table=True):
    __tablename__ = "events"

    id: uuid.UUID = Field(default_factory=uuid_pk, sa_type=UUID(as_uuid=True), primary_key=True)
    name: str
    description: str | None = None
    start_date: dt.date
    end_date: dt.date
    timezone: str
    cutoff_time: dt.time
    currency: str = Field(min_length=3, max_length=3)
    # Optional holiday configuration
    holiday_country_code: str | None = None  # e.g., 'DE'
    holiday_region_code: str | None = None  # e.g., 'DE-BE'
    created_at: dt.datetime = Field(
        default_factory=now_utc,
        sa_column=Column(SADateTime(timezone=True), nullable=False),
    )


class Membership(SQLModel, table=True):
    __tablename__ = "memberships"

    user_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), primary_key=True)
    event_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), primary_key=True)
    role: str = Field(default="member")
    joined_at: dt.datetime = Field(
        default_factory=now_utc,
        sa_column=Column(SADateTime(timezone=True), nullable=False),
    )
    left_at: dt.datetime | None = Field(
        default=None,
        sa_column=Column(SADateTime(timezone=True), nullable=True),
    )
    wants_to_leave: bool = Field(default=False)


class PriceItem(SQLModel, table=True):
    __tablename__ = "price_items"

    id: uuid.UUID = Field(default_factory=uuid_pk, sa_type=UUID(as_uuid=True), primary_key=True)
    event_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    name: str
    unit_price_minor: int
    active: bool = Field(default=True)
    created_at: dt.datetime = Field(
        default_factory=now_utc,
        sa_column=Column(SADateTime(timezone=True), nullable=False),
    )


class DailyOrder(SQLModel, table=True):
    __tablename__ = "daily_orders"

    id: uuid.UUID = Field(default_factory=uuid_pk, sa_type=UUID(as_uuid=True), primary_key=True)
    event_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    user_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    date: dt.date = Field(index=True)
    # [{price_item_id: UUID, qty: int}]
    items: list[dict] = Field(sa_type=PgJSON)
    locked_at: dt.datetime | None = Field(
        default=None, sa_column=Column(SADateTime(timezone=True), nullable=True)
    )


class Purchase(SQLModel, table=True):
    __tablename__ = "purchases"

    id: uuid.UUID = Field(default_factory=uuid_pk, sa_type=UUID(as_uuid=True), primary_key=True)
    event_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    date: dt.date = Field(index=True)
    buyer_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    finalized_at: dt.datetime = Field(
        default_factory=now_utc,
        sa_column=Column(SADateTime(timezone=True), nullable=False),
    )
    # authoritative lines, substitutions/omissions with allocations
    lines: list[dict] = Field(sa_type=PgJSON)
    total_minor: int
    notes: str | None = None
    version: int = Field(default=1)


class Payment(SQLModel, table=True):
    __tablename__ = "payments"

    id: uuid.UUID = Field(default_factory=uuid_pk, sa_type=UUID(as_uuid=True), primary_key=True)
    event_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    from_user_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    to_user_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    amount_minor: int
    currency: str = Field(min_length=3, max_length=3)
    status: str = Field(default="pending")  # pending|confirmed|declined|canceled
    note: str | None = None
    created_at: dt.datetime = Field(
        default_factory=now_utc,
        sa_column=Column(SADateTime(timezone=True), nullable=False),
    )
    decided_at: dt.datetime | None = Field(
        default=None, sa_column=Column(SADateTime(timezone=True), nullable=True)
    )
    version: int = Field(default=1)


class PaymentEvent(SQLModel, table=True):
    __tablename__ = "payment_events"

    id: uuid.UUID = Field(default_factory=uuid_pk, sa_type=UUID(as_uuid=True), primary_key=True)
    payment_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    event_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    event_type: str  # created|confirmed|declined|canceled
    actor_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    at: dt.datetime = Field(
        default_factory=now_utc,
        sa_column=Column(SADateTime(timezone=True), nullable=False),
    )
    note: str | None = None


class InviteToken(SQLModel, table=True):
    __tablename__ = "invite_tokens"

    id: uuid.UUID = Field(default_factory=uuid_pk, sa_type=UUID(as_uuid=True), primary_key=True)
    event_id: uuid.UUID = Field(sa_type=UUID(as_uuid=True), index=True)
    token_hash: str = Field(index=True, unique=True)
    created_by: uuid.UUID = Field(sa_type=UUID(as_uuid=True))
    created_at: dt.datetime = Field(
        default_factory=now_utc,
        sa_column=Column(SADateTime(timezone=True), nullable=False),
    )
    expires_at: dt.datetime = Field(sa_column=Column(SADateTime(timezone=True), nullable=False))
    revoked_at: dt.datetime | None = Field(
        default=None, sa_column=Column(SADateTime(timezone=True), nullable=True)
    )
    max_uses: int | None = None
    used_count: int = Field(default=0)
    last_used_at: dt.datetime | None = Field(
        default=None, sa_column=Column(SADateTime(timezone=True), nullable=True)
    )
    email_domain: str | None = None
    email_allowlist: list[str] | None = Field(default=None, sa_type=PgJSON)
    locale_hint: str | None = None
    notes: str | None = None
