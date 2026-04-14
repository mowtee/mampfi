import datetime as dt
import uuid

from pydantic import BaseModel, EmailStr, Field


class GroupInviteIn(BaseModel):
    ttl_days: int = Field(default=14, gt=0, le=365)
    max_uses: int | None = Field(default=None, gt=0)


class SingleInviteIn(BaseModel):
    ttl_days: int = Field(default=14, gt=0, le=365)
    email: EmailStr | None = None


class InviteOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    created_at: dt.datetime
    expires_at: dt.datetime
    revoked_at: dt.datetime | None
    max_uses: int | None
    used_count: int
    last_used_at: dt.datetime | None
    notes: str | None = None
    token_raw: str | None = None


class EmailInviteIn(BaseModel):
    emails: str = Field(min_length=1, max_length=2000)
    lang: str = Field(default="de", max_length=10)


class RedeemIn(BaseModel):
    token: str
