"""Tests for order upsert, retrieval, rollover, and aggregate."""

import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from mampfi_api.models import DailyOrder, Membership, PriceItem
from mampfi_api.timeutils import now_utc

from .conftest import auth_headers, make_event

# Orders for "tomorrow" are used throughout: the cutoff for tomorrow is today at
# ev.cutoff_time (23:59), which hasn't passed yet, so orders can be placed.
ORDER_DATE = dt.date.today() + dt.timedelta(days=1)
PREV_DATE = dt.date.today()


def _add_item(session: Session, event_id, *, name="Main", price=850, active=True) -> PriceItem:
    item = PriceItem(event_id=event_id, name=name, unit_price_minor=price, active=active)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def _join(session: Session, user_id, event_id):
    session.add(Membership(user_id=user_id, event_id=event_id, role="member", joined_at=now_utc()))
    session.commit()


@pytest.fixture()
def ev(session: Session, user):
    today = dt.date.today()
    return make_event(
        session,
        user,
        start_date=today - dt.timedelta(days=5),
        end_date=today + dt.timedelta(days=10),
        cutoff_time=dt.time(23, 59),
    )


@pytest.fixture()
def item(session: Session, ev):
    return _add_item(session, ev.id)


def test_upsert_order(client: TestClient, session: Session, user, ev, item):
    resp = client.put(
        f"/v1/events/{ev.id}/orders/{ORDER_DATE}/me",
        json={"date": str(ORDER_DATE), "items": [{"price_item_id": str(item.id), "qty": 2}]},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_upsert_order_updates_existing(client: TestClient, session: Session, user, ev, item):
    headers = auth_headers(user.email)
    client.put(
        f"/v1/events/{ev.id}/orders/{ORDER_DATE}/me",
        json={"date": str(ORDER_DATE), "items": [{"price_item_id": str(item.id), "qty": 1}]},
        headers=headers,
    )
    client.put(
        f"/v1/events/{ev.id}/orders/{ORDER_DATE}/me",
        json={"date": str(ORDER_DATE), "items": [{"price_item_id": str(item.id), "qty": 3}]},
        headers=headers,
    )
    order = session.exec(
        select(DailyOrder).where(
            DailyOrder.event_id == ev.id,
            DailyOrder.user_id == user.id,
            DailyOrder.date == ORDER_DATE,
        )
    ).first()
    assert order is not None
    assert order.items[0]["qty"] == 3


def test_upsert_order_inactive_item_rejected(client: TestClient, session: Session, user, ev):
    inactive = _add_item(session, ev.id, name="Old", active=False)
    resp = client.put(
        f"/v1/events/{ev.id}/orders/{ORDER_DATE}/me",
        json={"date": str(ORDER_DATE), "items": [{"price_item_id": str(inactive.id), "qty": 1}]},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 409


def test_upsert_order_outside_window(client: TestClient, session: Session, user, ev, item):
    future = dt.date.today() + dt.timedelta(days=30)
    resp = client.put(
        f"/v1/events/{ev.id}/orders/{future}/me",
        json={"date": str(future), "items": []},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 400


def test_get_order_empty(client: TestClient, session: Session, user, ev, item):
    resp = client.get(
        f"/v1/events/{ev.id}/orders/{ORDER_DATE}/me", headers=auth_headers(user.email)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["is_rolled_over"] is None


def test_get_order_rollover(client: TestClient, session: Session, user, ev, item):
    # Seed an order for PREV_DATE (today); expect it to roll over to ORDER_DATE (tomorrow)
    session.add(
        DailyOrder(
            event_id=ev.id,
            user_id=user.id,
            date=PREV_DATE,
            items=[{"price_item_id": str(item.id), "qty": 2}],
        )
    )
    session.commit()
    resp = client.get(
        f"/v1/events/{ev.id}/orders/{ORDER_DATE}/me", headers=auth_headers(user.email)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_rolled_over"] is True
    assert data["items"][0]["qty"] == 2


def test_aggregate_orders(client: TestClient, session: Session, user, other_user, ev, item):
    _join(session, other_user.id, ev.id)
    for u in [user, other_user]:
        session.add(
            DailyOrder(
                event_id=ev.id,
                user_id=u.id,
                date=PREV_DATE,
                items=[{"price_item_id": str(item.id), "qty": 1}],
            )
        )
    session.commit()

    resp = client.get(
        f"/v1/events/{ev.id}/orders/aggregate",
        params={"date": str(PREV_DATE)},
        headers=auth_headers(user.email),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"][0]["total_qty"] == 2
