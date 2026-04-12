"""Tests for balance computation."""

import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from mampfi_api.models import Membership, Payment, Purchase
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


def test_balances_all_zero_initially(client: TestClient, user, ev):
    resp = client.get(f"/v1/events/{ev.id}/balances", headers=auth_headers(user.email))
    assert resp.status_code == 200
    data = resp.json()
    assert data["currency"] == "EUR"
    for line in data["totals"]:
        assert line["balance_minor"] == 0


def test_balances_after_purchase(client: TestClient, session: Session, user, other_user, ev):
    today = dt.date.today()
    purchase = Purchase(
        event_id=ev.id,
        date=today,
        buyer_id=user.id,
        finalized_at=now_utc(),
        lines=[
            {
                "type": "price_item",
                "price_item_id": None,
                "name": "Lunch",
                "qty_final": 2,
                "unit_price_minor": 500,
                "reason": None,
                "allocations": [
                    {"user_id": str(user.id), "qty": 1},
                    {"user_id": str(other_user.id), "qty": 1},
                ],
            }
        ],
        total_minor=1000,
    )
    session.add(purchase)
    session.commit()

    resp = client.get(f"/v1/events/{ev.id}/balances", headers=auth_headers(user.email))
    assert resp.status_code == 200
    totals = {t["user_id"]: t["balance_minor"] for t in resp.json()["totals"]}
    # buyer paid 1000 total, owes 500 of their own share → net +500
    assert totals[str(user.id)] == 500
    # other_user owes 500
    assert totals[str(other_user.id)] == -500


def test_balances_after_confirmed_payment(
    client: TestClient, session: Session, user, other_user, ev
):
    today = dt.date.today()
    # Set up a purchase so user is owed 500
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
                    "qty_final": 2,
                    "unit_price_minor": 500,
                    "reason": None,
                    "allocations": [
                        {"user_id": str(user.id), "qty": 1},
                        {"user_id": str(other_user.id), "qty": 1},
                    ],
                }
            ],
            total_minor=1000,
        )
    )
    # other_user pays user 500 (confirmed)
    session.add(
        Payment(
            event_id=ev.id,
            from_user_id=other_user.id,
            to_user_id=user.id,
            amount_minor=500,
            currency="EUR",
            status="confirmed",
            created_at=now_utc(),
        )
    )
    session.commit()

    resp = client.get(f"/v1/events/{ev.id}/balances", headers=auth_headers(user.email))
    totals = {t["user_id"]: t["balance_minor"] for t in resp.json()["totals"]}
    assert totals[str(user.id)] == 0
    assert totals[str(other_user.id)] == 0


def test_balances_pending_payment_not_counted(
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
                    "qty_final": 2,
                    "unit_price_minor": 500,
                    "reason": None,
                    "allocations": [
                        {"user_id": str(user.id), "qty": 1},
                        {"user_id": str(other_user.id), "qty": 1},
                    ],
                }
            ],
            total_minor=1000,
        )
    )
    session.add(
        Payment(
            event_id=ev.id,
            from_user_id=other_user.id,
            to_user_id=user.id,
            amount_minor=500,
            currency="EUR",
            status="pending",
            created_at=now_utc(),
        )
    )
    session.commit()

    resp = client.get(f"/v1/events/{ev.id}/balances", headers=auth_headers(user.email))
    totals = {t["user_id"]: t["balance_minor"] for t in resp.json()["totals"]}
    assert totals[str(user.id)] == 500
    assert totals[str(other_user.id)] == -500
