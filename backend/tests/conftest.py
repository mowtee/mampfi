"""Test fixtures: in-memory SQLite DB + FastAPI test client with overridden session/auth."""

import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel

from mampfi_api.config import get_settings
from mampfi_api.db import session_dep
from mampfi_api.main import app
from mampfi_api.models import Event, Membership, User
from mampfi_api.timeutils import now_utc

# Ensure cookies work over plain HTTP in tests
get_settings().cookie_secure = False


@pytest.fixture(name="engine", scope="function")
def engine_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="session", scope="function")
def session_fixture(engine):
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client", scope="function")
def client_fixture(session: Session):
    def _session_override():
        yield session

    app.dependency_overrides[session_dep] = _session_override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers to create domain objects directly in the test DB
# ---------------------------------------------------------------------------


def make_user(session: Session, email: str = "test@example.com") -> User:
    user = User(email=email)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def make_event(
    session: Session,
    owner: User,
    *,
    name: str = "Test Event",
    start_date: dt.date | None = None,
    end_date: dt.date | None = None,
    timezone: str = "Europe/Berlin",
    cutoff_time: dt.time = dt.time(22, 0),
    currency: str = "EUR",
) -> Event:
    today = dt.date.today()
    ev = Event(
        name=name,
        start_date=start_date or today,
        end_date=end_date or today + dt.timedelta(days=7),
        timezone=timezone,
        cutoff_time=cutoff_time,
        currency=currency,
    )
    session.add(ev)
    session.flush()
    session.add(Membership(user_id=owner.id, event_id=ev.id, role="owner", joined_at=now_utc()))
    session.commit()
    session.refresh(ev)
    return ev


def auth_headers(email: str) -> dict[str, str]:
    """Return headers that satisfy the dev-auth middleware."""
    return {"X-Dev-User": email}


@pytest.fixture(name="user")
def user_fixture(session: Session) -> User:
    return make_user(session, "owner@example.com")


@pytest.fixture(name="other_user")
def other_user_fixture(session: Session) -> User:
    return make_user(session, "other@example.com")


@pytest.fixture(name="event")
def event_fixture(session: Session, user: User) -> Event:
    return make_event(session, user)


@pytest.fixture(name="client_as_owner")
def client_as_owner_fixture(client: TestClient, user: User) -> TestClient:
    """TestClient pre-configured to authenticate as the event owner."""

    class _AuthClient:
        def __init__(self, inner: TestClient, headers: dict):
            self._c = inner
            self._h = headers

        def _merge(self, kwargs):
            kw = dict(kwargs)
            kw["headers"] = {**self._h, **kw.get("headers", {})}
            return kw

        def get(self, *a, **kw):
            return self._c.get(*a, **self._merge(kw))

        def post(self, *a, **kw):
            return self._c.post(*a, **self._merge(kw))

        def put(self, *a, **kw):
            return self._c.put(*a, **self._merge(kw))

        def patch(self, *a, **kw):
            return self._c.patch(*a, **self._merge(kw))

        def delete(self, *a, **kw):
            return self._c.delete(*a, **self._merge(kw))

    return _AuthClient(client, auth_headers(user.email))
