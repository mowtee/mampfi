import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlmodel import Session

from ..auth import get_current_user
from ..db import session_dep
from ..models import Event, PriceItem, User
from ..schemas.events import EventCreate, EventUpdate, EventWithMe, MemberOut, PriceItemAdd
from ..services import events as svc
from ..services.memberships import get_event_as_member

router = APIRouter(prefix="/v1/events", tags=["events"])


@router.post("", response_model=Event, status_code=status.HTTP_201_CREATED)
def create_event(
    data: EventCreate,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Event:
    return svc.create_event(session, data, user)


@router.get("", response_model=list[EventWithMe])
def list_my_events(
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> list[EventWithMe]:
    return svc.list_my_events(session, user)


@router.get("/{event_id}", response_model=Event)
def get_event(
    event_id: uuid.UUID,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Event:
    return get_event_as_member(session, event_id, user)


@router.patch("/{event_id}", response_model=Event)
def update_event(
    event_id: uuid.UUID,
    data: EventUpdate,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Event:
    return svc.update_event(session, event_id, data, user)


@router.get("/{event_id}/price-items", response_model=list[PriceItem])
def list_price_items(
    event_id: uuid.UUID,
    include_inactive: bool = Query(default=False),
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> list[PriceItem]:
    return svc.list_price_items(session, event_id, user, include_inactive)


@router.post(
    "/{event_id}/price-items", response_model=PriceItem, status_code=status.HTTP_201_CREATED
)
def add_price_item(
    event_id: uuid.UUID,
    data: PriceItemAdd,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> PriceItem:
    return svc.add_price_item(session, event_id, data, user)


@router.post(
    "/{event_id}/price-items/{price_item_id}/deactivate",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def deactivate_price_item(
    event_id: uuid.UUID,
    price_item_id: uuid.UUID,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Response:
    svc.deactivate_price_item(session, event_id, price_item_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{event_id}/price-items/{price_item_id}/activate",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def activate_price_item(
    event_id: uuid.UUID,
    price_item_id: uuid.UUID,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Response:
    svc.activate_price_item(session, event_id, price_item_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{event_id}/members", response_model=list[MemberOut])
def list_members(
    event_id: uuid.UUID,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> list[MemberOut]:
    return svc.list_members(session, event_id, user)


@router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_event(
    event_id: uuid.UUID,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Response:
    svc.delete_event(session, event_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
