import uuid

from sqlmodel import Session

from ..exceptions import Forbidden, NotFound
from ..models import Event, Membership, User


def require_member(session: Session, event_id: uuid.UUID, user_id: uuid.UUID) -> Membership:
    """Return the membership or raise Forbidden. Does not check for event existence."""
    m = session.get(Membership, (user_id, event_id))
    if not m:
        raise Forbidden("not a member of this event")
    return m


def require_owner(session: Session, event_id: uuid.UUID, user_id: uuid.UUID) -> Membership:
    m = session.get(Membership, (user_id, event_id))
    if not m or m.role != "owner":
        raise Forbidden("owner role required")
    return m


def get_event(session: Session, event_id: uuid.UUID) -> Event:
    ev = session.get(Event, event_id)
    if ev is None:
        raise NotFound("event")
    return ev


def get_event_as_member(session: Session, event_id: uuid.UUID, user: User) -> Event:
    ev = get_event(session, event_id)
    require_member(session, ev.id, user.id)
    return ev
