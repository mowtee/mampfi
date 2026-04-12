"""Tests for invite creation, redemption, and revocation."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from .conftest import auth_headers


def test_create_group_invite(client: TestClient, user, event):
    resp = client.post(
        f"/v1/events/{event.id}/invites/group",
        json={"ttl_days": 7},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "invite_url" in data


def test_create_group_invite_non_owner_forbidden(
    client: TestClient, other_user, event, session: Session
):
    from mampfi_api.models import Membership
    from mampfi_api.timeutils import now_utc

    session.add(
        Membership(user_id=other_user.id, event_id=event.id, role="member", joined_at=now_utc())
    )
    session.commit()
    resp = client.post(
        f"/v1/events/{event.id}/invites/group",
        json={"ttl_days": 7},
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 403


def test_redeem_invite_joins_event(client: TestClient, user, other_user, event):
    resp = client.post(
        f"/v1/events/{event.id}/invites/group",
        json={"ttl_days": 7},
        headers=auth_headers(user.email),
    )
    token = resp.json()["token"]

    resp = client.post(
        "/v1/invites/redeem",
        json={"token": token},
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "joined"

    # other_user can now access the event
    resp = client.get(f"/v1/events/{event.id}", headers=auth_headers(other_user.email))
    assert resp.status_code == 200


def test_redeem_invalid_token(client: TestClient, user):
    resp = client.post(
        "/v1/invites/redeem",
        json={"token": "notarealtoken"},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 400


def test_preview_invite(client: TestClient, user, other_user, event):
    resp = client.post(
        f"/v1/events/{event.id}/invites/group",
        json={"ttl_days": 7},
        headers=auth_headers(user.email),
    )
    token = resp.json()["token"]

    resp = client.get(
        "/v1/invites/preview",
        params={"token": token},
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_revoke_invite(client: TestClient, user, event):
    resp = client.post(
        f"/v1/events/{event.id}/invites/group",
        json={"ttl_days": 7},
        headers=auth_headers(user.email),
    )
    invite_id = resp.json()["invite"]["id"]
    token = resp.json()["token"]

    resp = client.post(
        f"/v1/events/{event.id}/invites/{invite_id}/revoke",
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 204

    # Token no longer valid
    resp = client.post(
        "/v1/invites/redeem",
        json={"token": token},
        headers=auth_headers("newcomer@example.com"),
    )
    assert resp.status_code == 400


def test_rotate_group_invite(client: TestClient, user, event):
    """Creating a second group invite revokes the first."""
    resp1 = client.post(
        f"/v1/events/{event.id}/invites/group",
        json={"ttl_days": 7},
        headers=auth_headers(user.email),
    )
    token1 = resp1.json()["token"]

    client.post(
        f"/v1/events/{event.id}/invites/group",
        json={"ttl_days": 7},
        headers=auth_headers(user.email),
    )

    resp = client.post(
        "/v1/invites/redeem",
        json={"token": token1},
        headers=auth_headers("newcomer2@example.com"),
    )
    assert resp.status_code == 400


def test_list_invites(client: TestClient, user, event):
    client.post(
        f"/v1/events/{event.id}/invites/group",
        json={"ttl_days": 7},
        headers=auth_headers(user.email),
    )
    resp = client.get(f"/v1/events/{event.id}/invites", headers=auth_headers(user.email))
    assert resp.status_code == 200
    assert len(resp.json()) == 1
