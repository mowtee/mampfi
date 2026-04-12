"""Tests for the dev auth middleware."""

from fastapi.testclient import TestClient


def test_missing_auth_header(client: TestClient):
    resp = client.get("/v1/events")
    assert resp.status_code == 401


def test_invalid_auth_header(client: TestClient):
    resp = client.get("/v1/events", headers={"X-Dev-User": "notanemail"})
    assert resp.status_code == 400


def test_auto_creates_user(client: TestClient):
    resp = client.get("/v1/events", headers={"X-Dev-User": "newuser@example.com"})
    assert resp.status_code == 200


def test_same_email_reuses_user(client: TestClient):
    client.get("/v1/events", headers={"X-Dev-User": "same@example.com"})
    resp = client.get("/v1/events", headers={"X-Dev-User": "same@example.com"})
    assert resp.status_code == 200
