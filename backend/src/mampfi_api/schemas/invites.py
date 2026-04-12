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
    expires_at: dt.datetime
    revoked_at: dt.datetime | None
    max_uses: int | None
    used_count: int
    last_used_at: dt.datetime | None


class RedeemIn(BaseModel):
    token: str
