from __future__ import annotations

import datetime as dt
import hashlib
import secrets
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlmodel import select

from ..auth import get_current_user
from ..db import get_session
from ..models import Event, InviteToken, Membership, User
from ..timeutils import now_utc
from pydantic import BaseModel


router = APIRouter(tags=["invites"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class GroupInviteIn(BaseModel):
    ttl_days: int = 14
    max_uses: Optional[int] = None


class SingleInviteIn(BaseModel):
    ttl_days: int = 14
    email: Optional[str] = None


class InviteOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    expires_at: dt.datetime
    revoked_at: Optional[dt.datetime]
    max_uses: Optional[int]
    used_count: int
    last_used_at: Optional[dt.datetime]


@router.post("/v1/events/{event_id}/invites/group")
def create_or_rotate_group_invite(
    event_id: uuid.UUID, data: GroupInviteIn, user: User = Depends(get_current_user)
) -> dict:
    now = now_utc()
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")
        if member.role != "owner":
            raise HTTPException(status_code=403, detail="owner role required")

        # Revoke previous group invites (max_uses is NULL indicates group link)
        prev = session.exec(
            select(InviteToken).where(InviteToken.event_id == ev.id, InviteToken.max_uses.is_(None), InviteToken.revoked_at.is_(None))
        ).all()
        for inv in prev:
            inv.revoked_at = now

        raw = secrets.token_urlsafe(32)
        token_hash = _hash_token(raw)
        invite = InviteToken(
            event_id=ev.id,
            token_hash=token_hash,
            created_by=user.id,
            created_at=now,
            expires_at=now + dt.timedelta(days=int(data.ttl_days)),
            revoked_at=None,
            max_uses=data.max_uses,  # None for group
            used_count=0,
        )
        session.add(invite)
        session.commit()
        session.refresh(invite)
        return {
            "invite": InviteOut.model_validate(invite, from_attributes=True).model_dump(),
            "token": raw,  # return token only at creation time
            "invite_url": f"/join?token={raw}",
        }


@router.post("/v1/events/{event_id}/invites/single")
def create_single_invite(event_id: uuid.UUID, data: SingleInviteIn, user: User = Depends(get_current_user)) -> dict:
    now = now_utc()
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")
        if member.role != "owner":
            raise HTTPException(status_code=403, detail="owner role required")

        raw = secrets.token_urlsafe(32)
        token_hash = _hash_token(raw)
        invite = InviteToken(
            event_id=ev.id,
            token_hash=token_hash,
            created_by=user.id,
            created_at=now,
            expires_at=now + dt.timedelta(days=int(data.ttl_days)),
            revoked_at=None,
            max_uses=1,
            used_count=0,
            notes=data.email,
        )
        session.add(invite)
        session.commit()
        session.refresh(invite)
        return {
            "invite": InviteOut.model_validate(invite, from_attributes=True).model_dump(),
            "token": raw,
            "invite_url": f"/join?token={raw}",
        }


@router.get("/v1/events/{event_id}/invites", response_model=List[InviteOut])
def list_invites(event_id: uuid.UUID, user: User = Depends(get_current_user)) -> List[InviteOut]:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")
        if member.role != "owner":
            raise HTTPException(status_code=403, detail="owner role required")
        invites = session.exec(select(InviteToken).where(InviteToken.event_id == ev.id)).all()
        return [InviteOut.model_validate(i, from_attributes=True) for i in invites]


@router.post(
    "/v1/events/{event_id}/invites/{invite_id}/revoke",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def revoke_invite(event_id: uuid.UUID, invite_id: uuid.UUID, user: User = Depends(get_current_user)) -> Response:
    now = now_utc()
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")
        if member.role != "owner":
            raise HTTPException(status_code=403, detail="owner role required")
        inv = session.get(InviteToken, invite_id)
        if not inv or inv.event_id != ev.id:
            raise HTTPException(status_code=404, detail="invite not found")
        inv.revoked_at = now
        session.add(inv)
        session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)


class RedeemIn(BaseModel):
    token: str


@router.post("/v1/invites/redeem")
def redeem_invite(data: RedeemIn, user: User = Depends(get_current_user)) -> dict:
    now = now_utc()
    token_hash = _hash_token(data.token)
    with get_session() as session:
        inv = session.exec(select(InviteToken).where(InviteToken.token_hash == token_hash)).first()
        if not inv:
            raise HTTPException(status_code=400, detail="invalid token")
        if inv.revoked_at is not None:
            raise HTTPException(status_code=400, detail="invite revoked")
        if now >= inv.expires_at:
            raise HTTPException(status_code=400, detail="invite expired")
        if inv.max_uses is not None and inv.used_count >= inv.max_uses:
            raise HTTPException(status_code=400, detail="invite exhausted")

        # Create membership if not exists
        ev = session.get(Event, inv.event_id)
        if ev is None:
            raise HTTPException(status_code=400, detail="event not found")

        member = session.get(Membership, (user.id, ev.id))
        if not member:
            session.add(Membership(user_id=user.id, event_id=ev.id, role="member", joined_at=now))

        inv.used_count += 1
        inv.last_used_at = now
        session.add(inv)
        session.commit()
        return {"status": "joined", "event": {"id": str(ev.id), "name": ev.name}}


@router.get("/v1/invites/preview")
def preview_invite(token: str, user: User = Depends(get_current_user)) -> dict:
    """Validate an invite token and return event details without joining.

    Requires identity (dev header or real auth) but no membership.
    """
    now = now_utc()
    token_hash = _hash_token(token)
    with get_session() as session:
        inv = session.exec(select(InviteToken).where(InviteToken.token_hash == token_hash)).first()
        if not inv:
            raise HTTPException(status_code=400, detail="invalid token")
        if inv.revoked_at is not None:
            raise HTTPException(status_code=400, detail="invite revoked")
        if now >= inv.expires_at:
            raise HTTPException(status_code=400, detail="invite expired")
        if inv.max_uses is not None and inv.used_count >= inv.max_uses:
            raise HTTPException(status_code=400, detail="invite exhausted")

        ev = session.get(Event, inv.event_id)
        if ev is None:
            raise HTTPException(status_code=400, detail="event not found")
        return {"status": "ok", "event": {"id": str(ev.id), "name": ev.name}}
