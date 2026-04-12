import datetime as dt
import uuid

from pydantic import BaseModel


class GroupInviteIn(BaseModel):
    ttl_days: int = 14
    max_uses: int | None = None


class SingleInviteIn(BaseModel):
    ttl_days: int = 14
    email: str | None = None


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
