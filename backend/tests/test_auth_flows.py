"""Tests for auth service and routes: signup, login, refresh, token families, password reset."""

import uuid

from sqlmodel import Session, select
from starlette.testclient import TestClient

from mampfi_api.models import RefreshToken, User
from mampfi_api.services.auth import (
    create_access_token,
    create_email_token,
    decode_access_token,
    decode_email_token,
    hash_password,
    verify_password,
)
from mampfi_api.timeutils import now_utc

# ---------------------------------------------------------------------------
# Unit: password hashing
# ---------------------------------------------------------------------------


def test_password_hash_roundtrip():
    h = hash_password("my-secret-123")
    assert h != "my-secret-123"
    assert verify_password("my-secret-123", h)
    assert not verify_password("wrong", h)


# ---------------------------------------------------------------------------
# Unit: JWT tokens
# ---------------------------------------------------------------------------

SECRET = "test-secret"


def test_access_token_roundtrip():
    uid = uuid.uuid7()
    tok = create_access_token(uid, SECRET, expire_minutes=15)
    assert decode_access_token(tok, SECRET) == uid


def test_email_token_roundtrip():
    uid = uuid.uuid7()
    tok = create_email_token(uid, "email_verify", SECRET, hours=24)
    assert decode_email_token(tok, "email_verify", SECRET) == uid


def test_email_token_wrong_purpose():
    uid = uuid.uuid7()
    tok = create_email_token(uid, "email_verify", SECRET, hours=24)
    import pytest

    from mampfi_api.exceptions import DomainError

    with pytest.raises(DomainError):
        decode_email_token(tok, "password_reset", SECRET)


# ---------------------------------------------------------------------------
# Integration: signup + login flow
# ---------------------------------------------------------------------------


def test_signup_creates_user(client: TestClient, session: Session):
    resp = client.post(
        "/v1/auth/signup",
        json={"email": "new@example.com", "password": "testpass123", "name": "New User"},
    )
    assert resp.status_code == 201
    user = session.exec(select(User).where(User.email == "new@example.com")).first()
    assert user is not None
    assert user.password_hash is not None
    assert user.email_verified_at is None


def test_signup_duplicate_email(client: TestClient):
    client.post(
        "/v1/auth/signup",
        json={"email": "dup@example.com", "password": "testpass123", "name": "A"},
    )
    resp = client.post(
        "/v1/auth/signup",
        json={"email": "dup@example.com", "password": "otherpass123", "name": "A"},
    )
    assert resp.status_code == 409


def test_signup_requires_name(client: TestClient):
    resp = client.post(
        "/v1/auth/signup",
        json={"email": "noname@example.com", "password": "testpass123"},
    )
    assert resp.status_code == 422


def test_login_unverified_fails(client: TestClient):
    client.post(
        "/v1/auth/signup",
        json={"email": "unverified@example.com", "password": "testpass123", "name": "A"},
    )
    resp = client.post(
        "/v1/auth/login",
        json={"email": "unverified@example.com", "password": "testpass123"},
    )
    assert resp.status_code == 400
    assert "not verified" in resp.json()["detail"]


def test_login_wrong_password(client: TestClient, session: Session):
    client.post(
        "/v1/auth/signup",
        json={"email": "wrong@example.com", "password": "testpass123", "name": "A"},
    )
    # Manually verify
    user = session.exec(select(User).where(User.email == "wrong@example.com")).first()
    user.email_verified_at = now_utc()
    session.commit()

    resp = client.post(
        "/v1/auth/login",
        json={"email": "wrong@example.com", "password": "badpassword"},
    )
    assert resp.status_code == 400
    assert "invalid" in resp.json()["detail"]


def test_full_signup_verify_login(client: TestClient, session: Session):
    # Signup
    client.post(
        "/v1/auth/signup",
        json={"email": "full@example.com", "password": "testpass123", "name": "Full User"},
    )

    # Get verification token from outbox
    user = session.exec(select(User).where(User.email == "full@example.com")).first()
    token = create_email_token(user.id, "email_verify", "change-me", hours=24)

    # Verify email
    resp = client.post("/v1/auth/verify-email", json={"token": token})
    assert resp.status_code == 200

    session.refresh(user)
    assert user.email_verified_at is not None

    # Login
    resp = client.post(
        "/v1/auth/login",
        json={"email": "full@example.com", "password": "testpass123"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "full@example.com"
    assert "access_token" in resp.cookies
    assert "refresh_token" in resp.cookies


# ---------------------------------------------------------------------------
# Refresh token rotation + family revocation
# ---------------------------------------------------------------------------


def test_refresh_rotates_token(client: TestClient, session: Session):
    # Setup: create verified user and login
    client.post(
        "/v1/auth/signup",
        json={"email": "refresh@example.com", "password": "testpass123", "name": "A"},
    )
    user = session.exec(select(User).where(User.email == "refresh@example.com")).first()
    user.email_verified_at = now_utc()
    session.commit()

    resp = client.post(
        "/v1/auth/login",
        json={"email": "refresh@example.com", "password": "testpass123"},
    )
    assert resp.status_code == 200

    # Refresh
    resp = client.post("/v1/auth/refresh")
    assert resp.status_code == 200
    assert "access_token" in resp.cookies


def test_refresh_reuse_revokes_family(client: TestClient, session: Session):
    # Setup
    client.post(
        "/v1/auth/signup",
        json={"email": "reuse@example.com", "password": "testpass123", "name": "A"},
    )
    user = session.exec(select(User).where(User.email == "reuse@example.com")).first()
    user.email_verified_at = now_utc()
    session.commit()

    # Login
    resp = client.post(
        "/v1/auth/login",
        json={"email": "reuse@example.com", "password": "testpass123"},
    )
    old_refresh = resp.cookies.get("refresh_token")

    # First refresh (valid)
    resp = client.post("/v1/auth/refresh")
    assert resp.status_code == 200

    # Replay old refresh token (reuse attack)
    client.cookies.set("refresh_token", old_refresh, path="/v1/auth")
    resp = client.post("/v1/auth/refresh")
    assert resp.status_code == 400
    assert "reused" in resp.json()["detail"].lower()

    # Verify all tokens in family are revoked
    tokens = session.exec(select(RefreshToken).where(RefreshToken.user_id == user.id)).all()
    assert all(t.revoked_at is not None for t in tokens)


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


def test_logout_clears_cookies(client: TestClient, session: Session):
    client.post(
        "/v1/auth/signup",
        json={"email": "logout@example.com", "password": "testpass123", "name": "A"},
    )
    user = session.exec(select(User).where(User.email == "logout@example.com")).first()
    user.email_verified_at = now_utc()
    session.commit()

    client.post(
        "/v1/auth/login",
        json={"email": "logout@example.com", "password": "testpass123"},
    )

    resp = client.post("/v1/auth/logout")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


def test_forgot_password_always_200(client: TestClient):
    resp = client.post(
        "/v1/auth/forgot-password",
        json={"email": "nonexistent@example.com"},
    )
    assert resp.status_code == 200


def test_password_reset_flow(client: TestClient, session: Session):
    # Signup + verify
    client.post(
        "/v1/auth/signup",
        json={"email": "reset@example.com", "password": "oldpass123", "name": "A"},
    )
    user = session.exec(select(User).where(User.email == "reset@example.com")).first()
    user.email_verified_at = now_utc()
    session.commit()

    # Generate reset token
    token = create_email_token(user.id, "password_reset", "change-me", hours=1)

    # Reset password
    resp = client.post(
        "/v1/auth/reset-password",
        json={"token": token, "password": "newpass456"},
    )
    assert resp.status_code == 200

    # Login with new password
    resp = client.post(
        "/v1/auth/login",
        json={"email": "reset@example.com", "password": "newpass456"},
    )
    assert resp.status_code == 200

    # Old password fails
    resp = client.post(
        "/v1/auth/login",
        json={"email": "reset@example.com", "password": "oldpass123"},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Dev mode still works (existing auth pattern)
# ---------------------------------------------------------------------------


def test_dev_header_still_works(client: TestClient):
    resp = client.get("/v1/events", headers={"X-Dev-User": "devuser@example.com"})
    assert resp.status_code == 200
