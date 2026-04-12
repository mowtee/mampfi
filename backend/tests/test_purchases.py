"""Tests for purchase finalization and retrieval."""

import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from mampfi_api.models import PriceItem

from .conftest import auth_headers, make_event


@pytest.fixture()
def ev(session: Session, user):
    today = dt.date.today()
    return make_event(session, user, start_date=today, end_date=today + dt.timedelta(days=7))


@pytest.fixture()
def item(session: Session, ev):
    i = PriceItem(event_id=ev.id, name="Main", unit_price_minor=850, active=True)
    session.add(i)
    session.commit()
    session.refresh(i)
    return i


def _purchase_payload(date: dt.date, item_id, qty=2) -> dict:
    return {
        "date": str(date),
        "lines": [
            {
                "type": "price_item",
                "price_item_id": str(item_id),
                "qty_final": qty,
                "unit_price_minor": 850,
                "allocations": [{"user_id": "00000000-0000-0000-0000-000000000001", "qty": qty}],
            }
        ],
    }


def test_finalize_purchase(client: TestClient, session: Session, user, ev, item):
    today = dt.date.today()
    payload = _purchase_payload(today, item.id, qty=2)
    # fix allocation user_id to something valid-looking
    payload["lines"][0]["allocations"] = [{"user_id": str(user.id), "qty": 2}]
    resp = client.post(
        f"/v1/events/{ev.id}/purchases",
        json=payload,
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["total_minor"] == 1700
    assert data["date"] == str(today)


def test_finalize_purchase_duplicate(client: TestClient, session: Session, user, ev, item):
    today = dt.date.today()
    payload = _purchase_payload(today, item.id)
    payload["lines"][0]["allocations"] = [{"user_id": str(user.id), "qty": 2}]
    client.post(f"/v1/events/{ev.id}/purchases", json=payload, headers=auth_headers(user.email))
    resp = client.post(
        f"/v1/events/{ev.id}/purchases", json=payload, headers=auth_headers(user.email)
    )
    assert resp.status_code == 409


def test_get_purchase(client: TestClient, session: Session, user, ev, item):
    today = dt.date.today()
    payload = _purchase_payload(today, item.id)
    payload["lines"][0]["allocations"] = [{"user_id": str(user.id), "qty": 2}]
    client.post(f"/v1/events/{ev.id}/purchases", json=payload, headers=auth_headers(user.email))
    resp = client.get(f"/v1/events/{ev.id}/purchases/{today}", headers=auth_headers(user.email))
    assert resp.status_code == 200
    assert resp.json()["date"] == str(today)


def test_get_purchase_not_found(client: TestClient, user, ev):
    resp = client.get(f"/v1/events/{ev.id}/purchases/2000-01-01", headers=auth_headers(user.email))
    assert resp.status_code == 404


def test_list_purchases(client: TestClient, session: Session, user, ev, item):
    today = dt.date.today()
    payload = _purchase_payload(today, item.id)
    payload["lines"][0]["allocations"] = [{"user_id": str(user.id), "qty": 2}]
    client.post(f"/v1/events/{ev.id}/purchases", json=payload, headers=auth_headers(user.email))
    resp = client.get(f"/v1/events/{ev.id}/purchases", headers=auth_headers(user.email))
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_finalize_purchase_allocation_mismatch(client: TestClient, user, ev, item):
    today = dt.date.today()
    resp = client.post(
        f"/v1/events/{ev.id}/purchases",
        json={
            "date": str(today),
            "lines": [
                {
                    "type": "price_item",
                    "price_item_id": str(item.id),
                    "qty_final": 3,
                    "unit_price_minor": 850,
                    "allocations": [{"user_id": str(user.id), "qty": 2}],
                }
            ],
        },
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 400
