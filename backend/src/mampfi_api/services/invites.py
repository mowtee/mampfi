import datetime as dt
import hashlib
import secrets
import uuid

from sqlmodel import Session, select

from ..exceptions import DomainError, NotFound
from ..models import Event, InviteToken, Membership, User
from ..schemas.invites import GroupInviteIn, InviteOut, SingleInviteIn
from ..services.events import get_event, require_owner
from ..timeutils import now_utc


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_utc(d: dt.datetime) -> dt.datetime:
    """Attach UTC tzinfo to naive datetimes (SQLite stores datetimes without tz)."""
    return d if d.tzinfo is not None else d.replace(tzinfo=dt.UTC)


def _validate_invite(inv: InviteToken, now: dt.datetime) -> None:
    if inv.revoked_at is not None:
        raise DomainError("invite revoked")
    if now >= _as_utc(inv.expires_at):
        raise DomainError("invite expired")
    if inv.max_uses is not None and inv.used_count >= inv.max_uses:
        raise DomainError("invite exhausted")


def create_group_invite(
    session: Session, event_id: uuid.UUID, data: GroupInviteIn, user: User
) -> tuple[InviteOut, str]:
    now = now_utc()
    ev = get_event(session, event_id)
    require_owner(session, ev.id, user.id)

    # Revoke previous group invites (max_uses IS NULL indicates a group link)
    for inv in session.exec(
        select(InviteToken).where(
            InviteToken.event_id == ev.id,
            InviteToken.max_uses.is_(None),
            InviteToken.revoked_at.is_(None),
        )
    ).all():
        inv.revoked_at = now

    raw = secrets.token_urlsafe(32)
    invite = InviteToken(
        event_id=ev.id,
        token_hash=_hash_token(raw),
        created_by=user.id,
        created_at=now,
        expires_at=now + dt.timedelta(days=int(data.ttl_days)),
        max_uses=data.max_uses,
        used_count=0,
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)
    return InviteOut.model_validate(invite, from_attributes=True), raw


def create_single_invite(
    session: Session, event_id: uuid.UUID, data: SingleInviteIn, user: User
) -> tuple[InviteOut, str]:
    now = now_utc()
    ev = get_event(session, event_id)
    require_owner(session, ev.id, user.id)

    raw = secrets.token_urlsafe(32)
    invite = InviteToken(
        event_id=ev.id,
        token_hash=_hash_token(raw),
        created_by=user.id,
        created_at=now,
        expires_at=now + dt.timedelta(days=int(data.ttl_days)),
        max_uses=1,
        used_count=0,
        notes=data.email,
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)
    return InviteOut.model_validate(invite, from_attributes=True), raw


def list_invites(session: Session, event_id: uuid.UUID, user: User) -> list[InviteOut]:
    ev = get_event(session, event_id)
    require_owner(session, ev.id, user.id)
    invites = session.exec(select(InviteToken).where(InviteToken.event_id == ev.id)).all()
    return [InviteOut.model_validate(i, from_attributes=True) for i in invites]


def revoke_invite(
    session: Session, event_id: uuid.UUID, invite_id: uuid.UUID, user: User
) -> None:
    ev = get_event(session, event_id)
    require_owner(session, ev.id, user.id)
    inv = session.get(InviteToken, invite_id)
    if not inv or inv.event_id != ev.id:
        raise NotFound("invite")
    inv.revoked_at = now_utc()
    session.add(inv)
    session.commit()


def redeem_invite(session: Session, token: str, user: User) -> dict:
    now = now_utc()
    token_hash = _hash_token(token)
    inv = session.exec(select(InviteToken).where(InviteToken.token_hash == token_hash)).first()
    if not inv:
        raise DomainError("invalid token")
    _validate_invite(inv, now)

    ev = session.get(Event, inv.event_id)
    if ev is None:
        raise NotFound("event")

    member = session.get(Membership, (user.id, ev.id))
    if not member:
        session.add(Membership(user_id=user.id, event_id=ev.id, role="member", joined_at=now))

    inv.used_count += 1
    inv.last_used_at = now
    session.add(inv)
    session.commit()
    return {"status": "joined", "event": {"id": str(ev.id), "name": ev.name}}


def preview_invite(session: Session, token: str, user: User) -> dict:
    now = now_utc()
    token_hash = _hash_token(token)
    inv = session.exec(select(InviteToken).where(InviteToken.token_hash == token_hash)).first()
    if not inv:
        raise DomainError("invalid token")
    _validate_invite(inv, now)

    ev = session.get(Event, inv.event_id)
    if ev is None:
        raise NotFound("event")
    return {"status": "ok", "event": {"id": str(ev.id), "name": ev.name}}
