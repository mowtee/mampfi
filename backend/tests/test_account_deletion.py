"""Tests for self-service account deletion."""

import datetime as dt

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from mampfi_api.models import Membership, Payment, Purchase, RefreshToken, User
from mampfi_api.timeutils import now_utc

from .conftest import auth_headers, make_user


def test_preview_empty_blockers(client: TestClient, user):
    resp = client.get("/v1/auth/delete-account/preview", headers=auth_headers(user.email))
    assert resp.status_code == 200
    body = resp.json()
    assert body["sole_owner_events"] == []
    assert body["balance_events"] == []
    assert body["pending_payments"] == []


def test_delete_blocked_by_sole_ownership(client: TestClient, user, event):
    resp = client.get("/v1/auth/delete-account/preview", headers=auth_headers(user.email))
    assert resp.status_code == 200
    body = resp.json()
    # user is sole owner of `event`
    assert len(body["sole_owner_events"]) == 1
    assert body["sole_owner_events"][0]["id"] == str(event.id)


def test_delete_blocked_by_nonzero_balance(
    client: TestClient, session: Session, user, other_user, event
):
    # other_user joins; owner buys something for other_user; both now have balances
    session.add(
        Membership(user_id=other_user.id, event_id=event.id, role="member", joined_at=now_utc())
    )
    session.add(
        Purchase(
            event_id=event.id,
            date=dt.date.today(),
            buyer_id=user.id,
            finalized_at=now_utc(),
            lines=[
                {
                    "type": "price_item",
                    "price_item_id": None,
                    "name": "Lunch",
                    "qty_final": 1,
                    "unit_price_minor": 500,
                    "reason": None,
                    "allocations": [{"user_id": str(other_user.id), "qty": 1}],
                }
            ],
            total_minor=500,
        )
    )
    session.commit()

    resp = client.get("/v1/auth/delete-account/preview", headers=auth_headers(other_user.email))
    body = resp.json()
    assert len(body["balance_events"]) == 1
    assert body["balance_events"][0]["balance_minor"] == -500


def test_delete_blocked_by_pending_outgoing_payment(
    client: TestClient, session: Session, user, other_user, event
):
    session.add(
        Membership(user_id=other_user.id, event_id=event.id, role="member", joined_at=now_utc())
    )
    session.add(
        Payment(
            event_id=event.id,
            from_user_id=other_user.id,
            to_user_id=user.id,
            amount_minor=100,
            currency="EUR",
            status="pending",
        )
    )
    session.commit()

    resp = client.get("/v1/auth/delete-account/preview", headers=auth_headers(other_user.email))
    body = resp.json()
    assert len(body["pending_payments"]) == 1


def test_delete_succeeds_with_no_blockers(client: TestClient, session: Session):
    u = make_user(session, "leaver@example.com")

    resp = client.post(
        "/v1/auth/delete-account",
        json={"confirmation": "leaver@example.com"},
        headers=auth_headers(u.email),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    session.expire_all()
    fresh = session.get(User, u.id)
    assert fresh.deleted_at is not None
    assert fresh.email.startswith("deleted-")
    assert fresh.name is None
    assert fresh.password_hash is None


def test_delete_declines_incoming_pending_payments(
    client: TestClient, session: Session, user, other_user, event
):
    session.add(
        Membership(user_id=other_user.id, event_id=event.id, role="member", joined_at=now_utc())
    )
    pay = Payment(
        event_id=event.id,
        from_user_id=user.id,
        to_user_id=other_user.id,
        amount_minor=100,
        currency="EUR",
        status="pending",
    )
    session.add(pay)
    session.commit()

    # other_user has no outgoing pending + no balance, so can delete
    resp = client.post(
        "/v1/auth/delete-account",
        json={"confirmation": "other@example.com"},
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 200

    session.expire_all()
    fresh = session.get(Payment, pay.id)
    assert fresh.status == "declined"


def test_delete_revokes_refresh_tokens(client: TestClient, session: Session, user):
    # Create a refresh token for user
    from mampfi_api.services.auth import create_refresh_token

    _, _ = create_refresh_token(session, user.id, 30)
    session.commit()

    tokens_before = session.exec(select(RefreshToken).where(RefreshToken.user_id == user.id)).all()
    assert any(t.revoked_at is None for t in tokens_before)

    resp = client.post(
        "/v1/auth/delete-account",
        json={"confirmation": user.email},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 200

    session.expire_all()
    tokens_after = session.exec(select(RefreshToken).where(RefreshToken.user_id == user.id)).all()
    assert all(t.revoked_at is not None for t in tokens_after)


def test_delete_wrong_confirmation(client: TestClient, user):
    resp = client.post(
        "/v1/auth/delete-account",
        json={"confirmation": "not-my-email@example.com"},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 400


def test_list_members_shows_deleted_as_placeholder(
    client: TestClient, session: Session, user, other_user, event
):
    session.add(
        Membership(user_id=other_user.id, event_id=event.id, role="member", joined_at=now_utc())
    )
    session.commit()

    # Delete other_user directly
    from mampfi_api.services.auth import delete_self_account

    delete_self_account(session, other_user, "other@example.com")

    resp = client.get(f"/v1/events/{event.id}/members", headers=auth_headers(user.email))
    assert resp.status_code == 200
    mems = resp.json()
    deleted = [m for m in mems if m["user_id"] == str(other_user.id)]
    assert len(deleted) == 1
    assert deleted[0]["name"] == "[deleted]"
    assert deleted[0]["email"] is None
    assert deleted[0]["left_at"] is not None
    assert deleted[0]["banned_at"] is not None


def test_promoted_owner_allows_sole_owner_to_delete(
    client: TestClient, session: Session, user, other_user, event
):
    # Make other_user an admin so `user` is no longer sole owner
    session.add(
        Membership(user_id=other_user.id, event_id=event.id, role="owner", joined_at=now_utc())
    )
    session.commit()

    resp = client.get("/v1/auth/delete-account/preview", headers=auth_headers(user.email))
    body = resp.json()
    assert body["sole_owner_events"] == []
