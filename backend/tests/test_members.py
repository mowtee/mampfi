"""Tests for leave-intent and leave-event flows."""

import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from mampfi_api.models import Membership, Purchase
from mampfi_api.timeutils import now_utc

from .conftest import auth_headers, make_event, make_user


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


def test_leave_event_plan_stops_after_surplus_covered(
    client: TestClient, session: Session, user, other_user
):
    """Regression: receive-branch of the leave plan must decrement remaining
    and stop once the leaver's positive balance is covered, not emit a line
    for every debtor in the event (which would over-collect)."""
    today = dt.date.today()
    ev = make_event(session, user)

    debtor_a = make_user(session, "a@example.com")
    debtor_b = make_user(session, "b@example.com")
    creditor_c = make_user(session, "c@example.com")
    for u in (debtor_a, debtor_b, creditor_c, other_user):
        session.add(Membership(user_id=u.id, event_id=ev.id, role="member", joined_at=now_utc()))
    session.commit()

    # Construct: other_user (leaver) +100, A -200, B -50, C +150 (sum = 0)
    # other_user buys 200 entirely for A
    session.add(
        Purchase(
            event_id=ev.id,
            date=today,
            buyer_id=other_user.id,
            finalized_at=now_utc(),
            lines=[
                {
                    "type": "price_item",
                    "price_item_id": None,
                    "name": "X",
                    "qty_final": 1,
                    "unit_price_minor": 20000,
                    "reason": None,
                    "allocations": [{"user_id": str(debtor_a.id), "qty": 1}],
                }
            ],
            total_minor=20000,
        )
    )
    # other_user buys 50 entirely for B
    session.add(
        Purchase(
            event_id=ev.id,
            date=today + dt.timedelta(days=1),
            buyer_id=other_user.id,
            finalized_at=now_utc(),
            lines=[
                {
                    "type": "price_item",
                    "price_item_id": None,
                    "name": "Y",
                    "qty_final": 1,
                    "unit_price_minor": 5000,
                    "reason": None,
                    "allocations": [{"user_id": str(debtor_b.id), "qty": 1}],
                }
            ],
            total_minor=5000,
        )
    )
    # C buys 150 entirely for other_user (counter-balance)
    session.add(
        Purchase(
            event_id=ev.id,
            date=today + dt.timedelta(days=2),
            buyer_id=creditor_c.id,
            finalized_at=now_utc(),
            lines=[
                {
                    "type": "price_item",
                    "price_item_id": None,
                    "name": "Z",
                    "qty_final": 1,
                    "unit_price_minor": 15000,
                    "reason": None,
                    "allocations": [{"user_id": str(other_user.id), "qty": 1}],
                }
            ],
            total_minor=15000,
        )
    )
    session.commit()

    resp = client.post(
        f"/v1/events/{ev.id}/members/me/leave",
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 409
    body = resp.json()["detail"]
    assert body["reason"] == "balance_not_zero"
    assert body["balance_minor"] == 10000  # +100.00 EUR
    plan = body["plan"]
    # Must terminate after A's 100 covers the surplus — not also list B.
    assert len(plan) == 1, f"plan should have 1 entry, got {plan}"
    assert plan[0]["action"] == "receive"
    assert plan[0]["from_user_id"] == str(debtor_a.id)
    assert plan[0]["amount_minor"] == 10000
    assert sum(p["amount_minor"] for p in plan) == body["balance_minor"]


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
