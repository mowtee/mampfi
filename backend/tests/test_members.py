"""Tests for leave-intent and leave-event flows."""

import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from mampfi_api.models import Membership, Purchase
from mampfi_api.timeutils import now_utc

from .conftest import auth_headers, make_event


@pytest.fixture()
def ev(session: Session, user, other_user):
    ev = make_event(session, user)
    session.add(
        Membership(user_id=other_user.id, event_id=ev.id, role="member", joined_at=now_utc())
    )
    session.commit()
    return ev


def test_set_leave_intent(client: TestClient, user, ev):
    resp = client.post(
        f"/v1/events/{ev.id}/members/me/leave-intent",
        json={"wants_to_leave": True},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 200
    assert resp.json()["wants_to_leave"] is True


def test_leave_event_with_zero_balance(client: TestClient, other_user, ev):
    resp = client.post(
        f"/v1/events/{ev.id}/members/me/leave",
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 204


def test_leave_event_blocked_by_nonzero_balance(
    client: TestClient, session: Session, user, other_user, ev
):
    today = dt.date.today()
    session.add(
        Purchase(
            event_id=ev.id,
            date=today,
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

    resp = client.post(
        f"/v1/events/{ev.id}/members/me/leave",
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["detail"]["reason"] == "balance_not_zero"
    assert body["detail"]["balance_minor"] == -500


def test_remove_member_without_ban(client: TestClient, user, other_user, ev, session):
    resp = client.post(
        f"/v1/events/{ev.id}/members/{other_user.id}/remove",
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 200
    assert resp.json()["banned"] is False

    mem = session.get(Membership, (other_user.id, ev.id))
    assert mem is not None
    assert mem.left_at is not None
    assert mem.banned_at is None


def test_remove_member_with_ban(client: TestClient, user, other_user, ev, session):
    resp = client.post(
        f"/v1/events/{ev.id}/members/{other_user.id}/remove",
        json={"ban": True},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 200
    assert resp.json()["banned"] is True

    mem = session.get(Membership, (other_user.id, ev.id))
    assert mem.left_at is not None
    assert mem.banned_at is not None


def test_unban_member(client: TestClient, user, other_user, ev, session):
    # Remove + ban first
    client.post(
        f"/v1/events/{ev.id}/members/{other_user.id}/remove",
        json={"ban": True},
        headers=auth_headers(user.email),
    )

    resp = client.post(
        f"/v1/events/{ev.id}/members/{other_user.id}/unban",
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "unbanned"

    mem = session.get(Membership, (other_user.id, ev.id))
    assert mem.banned_at is None
    # left_at is preserved — unban doesn't reactivate, it just allows rejoin
    assert mem.left_at is not None


def test_unban_non_banned_member_fails(client: TestClient, user, other_user, ev, session):
    resp = client.post(
        f"/v1/events/{ev.id}/members/{other_user.id}/unban",
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 400


def test_non_owner_cannot_unban(client: TestClient, user, other_user, ev, session):
    # Owner bans first
    client.post(
        f"/v1/events/{ev.id}/members/{other_user.id}/remove",
        json={"ban": True},
        headers=auth_headers(user.email),
    )

    # A third user (not owner) can't unban
    resp = client.post(
        f"/v1/events/{ev.id}/members/{other_user.id}/unban",
        headers=auth_headers("stranger@example.com"),
    )
    assert resp.status_code == 403
