"""Authentication service: signup, login, token management, password reset."""

import datetime as dt
import hashlib
import secrets
import uuid

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlmodel import Session, select

from ..config import Settings
from ..exceptions import Conflict, DomainError
from ..models import RefreshToken, User
from ..timeutils import now_utc

_ph = PasswordHasher()


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


# ---------------------------------------------------------------------------
# JWT access tokens (stateless, short-lived)
# ---------------------------------------------------------------------------


def create_access_token(user_id: uuid.UUID, secret: str, expire_minutes: int) -> str:
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now_utc(),
        "exp": now_utc() + dt.timedelta(minutes=expire_minutes),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_access_token(token: str, secret: str) -> uuid.UUID:
    payload = jwt.decode(token, secret, algorithms=["HS256"])
    if payload.get("type") != "access":
        raise DomainError("invalid token type")
    return uuid.UUID(payload["sub"])


# ---------------------------------------------------------------------------
# Stateless verification / reset tokens (JWT, not stored in DB)
# ---------------------------------------------------------------------------


def create_email_token(user_id: uuid.UUID, purpose: str, secret: str, hours: int) -> str:
    payload = {
        "sub": str(user_id),
        "purpose": purpose,
        "iat": now_utc(),
        "exp": now_utc() + dt.timedelta(hours=hours),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_email_token(token: str, purpose: str, secret: str) -> uuid.UUID:
    payload = jwt.decode(token, secret, algorithms=["HS256"])
    if payload.get("purpose") != purpose:
        raise DomainError("invalid token purpose")
    return uuid.UUID(payload["sub"])


# ---------------------------------------------------------------------------
# Refresh tokens (stored in DB, family-based rotation)
# ---------------------------------------------------------------------------


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _as_utc(d: dt.datetime) -> dt.datetime:
    """Attach UTC tzinfo to naive datetimes (SQLite stores without tz)."""
    return d if d.tzinfo is not None else d.replace(tzinfo=dt.UTC)


def create_refresh_token(
    session: Session,
    user_id: uuid.UUID,
    expire_days: int,
    family_id: uuid.UUID | None = None,
) -> tuple[RefreshToken, str]:
    raw = secrets.token_urlsafe(48)
    fid = family_id or uuid.uuid7()
    rt = RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(raw),
        family_id=fid,
        expires_at=now_utc() + dt.timedelta(days=expire_days),
    )
    session.add(rt)
    return rt, raw


def rotate_refresh_token(
    session: Session, raw_token: str, expire_days: int
) -> tuple[RefreshToken, str, User]:
    token_hash = _hash_token(raw_token)
    old = session.exec(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).first()

    if not old:
        raise DomainError("invalid refresh token")

    # Reuse detection: already replaced or revoked → revoke entire family
    if old.replaced_by is not None or old.revoked_at is not None:
        _revoke_family(session, old.family_id)
        session.commit()
        raise DomainError("refresh token reused — session revoked")

    if now_utc() >= _as_utc(old.expires_at):
        raise DomainError("refresh token expired")

    # Create successor in same family
    new_rt, new_raw = create_refresh_token(
        session, old.user_id, expire_days, family_id=old.family_id
    )
    old.replaced_by = new_rt.id
    session.add(old)

    user = session.get(User, old.user_id)
    if not user:
        raise DomainError("user not found")

    return new_rt, new_raw, user


def _revoke_family(session: Session, family_id: uuid.UUID) -> None:
    now = now_utc()
    tokens = session.exec(
        select(RefreshToken).where(
            RefreshToken.family_id == family_id,
            RefreshToken.revoked_at.is_(None),  # type: ignore[union-attr]
        )
    ).all()
    for t in tokens:
        t.revoked_at = now
        session.add(t)


def revoke_token(session: Session, raw_token: str) -> None:
    token_hash = _hash_token(raw_token)
    rt = session.exec(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).first()
    if rt:
        _revoke_family(session, rt.family_id)


def revoke_all_user_tokens(session: Session, user_id: uuid.UUID) -> None:
    now = now_utc()
    tokens = session.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),  # type: ignore[union-attr]
        )
    ).all()
    for t in tokens:
        t.revoked_at = now
        session.add(t)


# ---------------------------------------------------------------------------
# High-level auth flows
# ---------------------------------------------------------------------------


def signup(
    session: Session, email: str, password: str, name: str | None, settings: Settings
) -> User:
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise Conflict("email already registered")

    user = User(email=email, name=name, password_hash=hash_password(password))
    session.add(user)
    session.flush()  # get user.id before building token

    token = create_email_token(user.id, "email_verify", settings.secret_key, hours=24)
    from .email import enqueue_verification_email

    enqueue_verification_email(session, user, token, settings.frontend_url)

    session.commit()
    session.refresh(user)
    return user


def login(session: Session, email: str, password: str, settings: Settings) -> tuple[User, str, str]:
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not user.password_hash or not verify_password(password, user.password_hash):
        raise DomainError("invalid email or password")

    if not user.email_verified_at:
        raise DomainError("email not verified")

    access = create_access_token(user.id, settings.secret_key, settings.access_token_expire_minutes)
    _, raw_refresh = create_refresh_token(session, user.id, settings.refresh_token_expire_days)
    session.commit()
    return user, access, raw_refresh


def refresh(session: Session, raw_refresh_token: str, settings: Settings) -> tuple[User, str, str]:
    _, new_raw, user = rotate_refresh_token(
        session, raw_refresh_token, settings.refresh_token_expire_days
    )
    access = create_access_token(user.id, settings.secret_key, settings.access_token_expire_minutes)
    session.commit()
    return user, access, new_raw


def verify_email(session: Session, token: str, secret: str) -> User:
    user_id = decode_email_token(token, "email_verify", secret)
    user = session.get(User, user_id)
    if not user:
        raise DomainError("user not found")
    if user.email_verified_at:
        return user  # idempotent
    user.email_verified_at = now_utc()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def request_password_reset(session: Session, email: str, settings: Settings) -> None:
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        return  # don't reveal whether email exists

    token = create_email_token(user.id, "password_reset", settings.secret_key, hours=1)
    from .email import enqueue_password_reset_email

    enqueue_password_reset_email(session, user, token, settings.frontend_url)
    session.commit()


def reset_password(session: Session, token: str, new_password: str, secret: str) -> None:
    user_id = decode_email_token(token, "password_reset", secret)
    user = session.get(User, user_id)
    if not user:
        raise DomainError("user not found")
    user.password_hash = hash_password(new_password)
    session.add(user)
    revoke_all_user_tokens(session, user.id)
    session.commit()


def logout(session: Session, raw_refresh_token: str) -> None:
    revoke_token(session, raw_refresh_token)
    session.commit()
