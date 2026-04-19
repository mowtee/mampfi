"""Unit tests for services.memberships — the cross-cutting auth helpers."""

import uuid

import pytest
from sqlmodel import Session

from mampfi_api.exceptions import Forbidden, NotFound
from mampfi_api.models import Membership, User
from mampfi_api.services.memberships import (
    get_event,
    get_event_as_member,
    require_member,
    require_owner,
)
from mampfi_api.timeutils import now_utc


def test_get_event_returns_event(session: Session, event):
    ev = get_event(session, event.id)
    assert ev.id == event.id


def test_get_event_raises_not_found(session: Session):
    with pytest.raises(NotFound):
        get_event(session, uuid.uuid4())


def test_require_member_returns_membership(session: Session, user: User, event):
    m = require_member(session, event.id, user.id)
    assert m.user_id == user.id
    assert m.event_id == event.id


def test_require_member_raises_forbidden_for_non_member(session: Session, other_user: User, event):
    with pytest.raises(Forbidden):
        require_member(session, event.id, other_user.id)


def test_require_owner_returns_membership_for_owner(session: Session, user: User, event):
    m = require_owner(session, event.id, user.id)
    assert m.role == "owner"


def test_require_owner_raises_forbidden_for_plain_member(session: Session, other_user: User, event):
    session.add(
        Membership(user_id=other_user.id, event_id=event.id, role="member", joined_at=now_utc())
    )
    session.commit()
    with pytest.raises(Forbidden):
        require_owner(session, event.id, other_user.id)


def test_require_owner_raises_forbidden_for_non_member(session: Session, other_user: User, event):
    with pytest.raises(Forbidden):
        require_owner(session, event.id, other_user.id)


def test_get_event_as_member_returns_event(session: Session, user: User, event):
    ev = get_event_as_member(session, event.id, user)
    assert ev.id == event.id


def test_get_event_as_member_raises_forbidden_for_non_member(
    session: Session, other_user: User, event
):
    with pytest.raises(Forbidden):
        get_event_as_member(session, event.id, other_user)


def test_get_event_as_member_raises_not_found_before_membership(session: Session, user: User):
    with pytest.raises(NotFound):
        get_event_as_member(session, uuid.uuid4(), user)


def test_services_import_graph_has_no_event_balance_cycle():
    """Regression guard: balances and events must not import each other at module top."""
    import ast
    from pathlib import Path

    svc_dir = Path(__file__).parent.parent / "src" / "mampfi_api" / "services"

    def top_level_imports(path: Path) -> set[str]:
        tree = ast.parse(path.read_text())
        names: set[str] = set()
        for node in tree.body:
            if isinstance(node, ast.ImportFrom) and node.module:
                names.add(node.module)
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    names.add(alias.name)
        return names

    balances_imports = top_level_imports(svc_dir / "balances.py")

    # events may import balances; balances must NOT import events.
    assert not any("services.events" in i for i in balances_imports), (
        f"balances.py imports events.py at module top: {balances_imports}"
    )

    # The helpers must live in memberships.py, not events.py — otherwise
    # every caller that needs require_member is forced to depend on events.
    other_services = [
        "balances.py",
        "orders.py",
        "purchases.py",
        "members.py",
        "invites.py",
        "payments.py",
        "auth.py",
    ]
    for name in other_services:
        imports = top_level_imports(svc_dir / name)
        assert not any("services.events" in i for i in imports), (
            f"{name} still imports helpers from services.events; "
            f"should import from services.memberships"
        )
