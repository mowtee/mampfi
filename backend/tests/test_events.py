"""Tests for event creation, price items, and member listing."""


from fastapi.testclient import TestClient
from sqlmodel import Session

from .conftest import auth_headers


def test_create_event(client: TestClient, user, session: Session):
    resp = client.post(
        "/v1/events",
        json={
            "name": "Lunch Club",
            "start_date": "2025-01-01",
            "end_date": "2025-01-31",
            "timezone": "Europe/Berlin",
            "cutoff_time": "22:00:00",
            "currency": "EUR",
            "price_items": [{"name": "Main", "unit_price_minor": 850}],
        },
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Lunch Club"
    assert data["currency"] == "EUR"


def test_create_event_bad_dates(client: TestClient, user):
    resp = client.post(
        "/v1/events",
        json={
            "name": "Bad",
            "start_date": "2025-02-01",
            "end_date": "2025-01-01",
            "timezone": "Europe/Berlin",
            "cutoff_time": "22:00:00",
            "currency": "EUR",
            "price_items": [],
        },
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 400


def test_create_event_bad_timezone(client: TestClient, user):
    resp = client.post(
        "/v1/events",
        json={
            "name": "Bad TZ",
            "start_date": "2025-01-01",
            "end_date": "2025-01-31",
            "timezone": "Not/ATimezone",
            "cutoff_time": "22:00:00",
            "currency": "EUR",
            "price_items": [],
        },
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 400


def test_list_my_events_empty(client: TestClient, user):
    resp = client.get("/v1/events", headers=auth_headers(user.email))
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_my_events(client: TestClient, user, event, session):
    resp = client.get("/v1/events", headers=auth_headers(user.email))
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == event.name


def test_get_event_as_member(client: TestClient, user, event):
    resp = client.get(f"/v1/events/{event.id}", headers=auth_headers(user.email))
    assert resp.status_code == 200
    assert resp.json()["id"] == str(event.id)


def test_get_event_not_found(client: TestClient, user):
    import uuid

    resp = client.get(f"/v1/events/{uuid.uuid4()}", headers=auth_headers(user.email))
    assert resp.status_code == 404


def test_get_event_forbidden(client: TestClient, other_user, event):
    resp = client.get(f"/v1/events/{event.id}", headers=auth_headers(other_user.email))
    assert resp.status_code == 403


def test_add_price_item(client: TestClient, user, event):
    resp = client.post(
        f"/v1/events/{event.id}/price-items",
        json={"name": "Soup", "unit_price_minor": 300},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Soup"
    assert resp.json()["unit_price_minor"] == 300


def test_add_price_item_non_owner_forbidden(client: TestClient, other_user, event, session):
    from mampfi_api.models import Membership
    from mampfi_api.timeutils import now_utc

    session.add(Membership(user_id=other_user.id, event_id=event.id, role="member", joined_at=now_utc()))
    session.commit()
    resp = client.post(
        f"/v1/events/{event.id}/price-items",
        json={"name": "Soup", "unit_price_minor": 300},
        headers=auth_headers(other_user.email),
    )
    assert resp.status_code == 403


def test_deactivate_and_activate_price_item(client: TestClient, user, event, session):
    from mampfi_api.models import PriceItem

    item = PriceItem(event_id=event.id, name="Coffee", unit_price_minor=200, active=True)
    session.add(item)
    session.commit()

    resp = client.post(
        f"/v1/events/{event.id}/price-items/{item.id}/deactivate",
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 204
    session.refresh(item)
    assert item.active is False

    resp = client.post(
        f"/v1/events/{event.id}/price-items/{item.id}/activate",
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 204
    session.refresh(item)
    assert item.active is True


def test_list_members(client: TestClient, user, event):
    resp = client.get(f"/v1/events/{event.id}/members", headers=auth_headers(user.email))
    assert resp.status_code == 200
    members = resp.json()
    assert len(members) == 1
    assert members[0]["role"] == "owner"
