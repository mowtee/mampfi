"""Tests for payment lifecycle: create → confirm/decline/cancel."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from mampfi_api.models import Membership
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


def _create_payment(client: TestClient, ev_id, from_email: str, to_user_id, amount=500):
    return client.post(
        f"/v1/events/{ev_id}/payments",
        json={"to_user_id": str(to_user_id), "amount_minor": amount},
        headers=auth_headers(from_email),
    )


def test_create_payment(client: TestClient, user, other_user, ev):
    resp = _create_payment(client, ev.id, user.email, other_user.id)
    assert resp.status_code == 201
    data = resp.json()
    assert data["amount_minor"] == 500
    assert data["status"] == "pending"


def test_create_payment_to_self(client: TestClient, user, ev):
    resp = _create_payment(client, ev.id, user.email, user.id)
    assert resp.status_code == 400


def test_create_payment_zero_amount(client: TestClient, user, other_user, ev):
    resp = client.post(
        f"/v1/events/{ev.id}/payments",
        json={"to_user_id": str(other_user.id), "amount_minor": 0},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 422


def test_confirm_payment(client: TestClient, user, other_user, ev):
    resp = _create_payment(client, ev.id, user.email, other_user.id)
    payment_id = resp.json()["id"]

    resp = client.post(
        f"/v1/events/{ev.id}/payments/{payment_id}/confirm",
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "confirmed"


def test_confirm_by_wrong_user(client: TestClient, user, other_user, ev):
    resp = _create_payment(client, ev.id, user.email, other_user.id)
    payment_id = resp.json()["id"]

    resp = client.post(
        f"/v1/events/{ev.id}/payments/{payment_id}/confirm",
        headers=auth_headers(user.email),  # sender, not recipient
    )
    assert resp.status_code == 403


def test_decline_payment(client: TestClient, user, other_user, ev):
    resp = _create_payment(client, ev.id, user.email, other_user.id)
    payment_id = resp.json()["id"]

    resp = client.post(
        f"/v1/events/{ev.id}/payments/{payment_id}/decline",
        json={"reason": "wrong amount"},
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "declined"


def test_cancel_payment(client: TestClient, user, other_user, ev):
    resp = _create_payment(client, ev.id, user.email, other_user.id)
    payment_id = resp.json()["id"]

    resp = client.post(
        f"/v1/events/{ev.id}/payments/{payment_id}/cancel",
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "canceled"


def test_cancel_by_wrong_user(client: TestClient, user, other_user, ev):
    resp = _create_payment(client, ev.id, user.email, other_user.id)
    payment_id = resp.json()["id"]

    resp = client.post(
        f"/v1/events/{ev.id}/payments/{payment_id}/cancel",
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 403


def test_double_confirm_rejected(client: TestClient, user, other_user, ev):
    resp = _create_payment(client, ev.id, user.email, other_user.id)
    payment_id = resp.json()["id"]
    client.post(
        f"/v1/events/{ev.id}/payments/{payment_id}/confirm",
        headers=auth_headers(other_user.email),
    )
    resp = client.post(
        f"/v1/events/{ev.id}/payments/{payment_id}/confirm",
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 409


def test_list_payment_events(client: TestClient, user, other_user, ev):
    resp = _create_payment(client, ev.id, user.email, other_user.id)
    payment_id = resp.json()["id"]

    resp = client.get(
        f"/v1/events/{ev.id}/payments/{payment_id}/events",
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) == 1
    assert events[0]["event_type"] == "created"
