import uuid

from fastapi import APIRouter, Depends, Query, Response, status

from ..auth import get_current_user
from ..db import get_session
from ..models import Event, PriceItem, User
from ..schemas.events import EventCreate, EventUpdate, EventWithMe, MemberOut, PriceItemAdd
from ..services import events as svc

router = APIRouter(prefix="/v1/events", tags=["events"])


@router.post("", response_model=Event, status_code=status.HTTP_201_CREATED)
def create_event(data: EventCreate, user: User = Depends(get_current_user)) -> Event:
    with get_session() as session:
        return svc.create_event(session, data, user)


@router.get("", response_model=list[EventWithMe])
def list_my_events(user: User = Depends(get_current_user)) -> list[EventWithMe]:
    with get_session() as session:
        return svc.list_my_events(session, user)


@router.get("/{event_id}", response_model=Event)
def get_event(event_id: uuid.UUID, user: User = Depends(get_current_user)) -> Event:
    with get_session() as session:
        return svc.get_event_as_member(session, event_id, user)


@router.patch("/{event_id}", response_model=Event)
def update_event(
    event_id: uuid.UUID, data: EventUpdate, user: User = Depends(get_current_user)
) -> Event:
    with get_session() as session:
        return svc.update_event(session, event_id, data, user)


@router.get("/{event_id}/price-items", response_model=list[PriceItem])
def list_price_items(
    event_id: uuid.UUID,
    user: User = Depends(get_current_user),
    include_inactive: bool = Query(default=False),
) -> list[PriceItem]:
    with get_session() as session:
        return svc.list_price_items(session, event_id, user, include_inactive)


@router.post(
    "/{event_id}/price-items", response_model=PriceItem, status_code=status.HTTP_201_CREATED
)
def add_price_item(
    event_id: uuid.UUID, data: PriceItemAdd, user: User = Depends(get_current_user)
) -> PriceItem:
    with get_session() as session:
        return svc.add_price_item(session, event_id, data, user)


@router.post(
    "/{event_id}/price-items/{price_item_id}/deactivate",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def deactivate_price_item(
    event_id: uuid.UUID, price_item_id: uuid.UUID, user: User = Depends(get_current_user)
) -> Response:
    with get_session() as session:
        svc.deactivate_price_item(session, event_id, price_item_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{event_id}/price-items/{price_item_id}/activate",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def activate_price_item(
    event_id: uuid.UUID, price_item_id: uuid.UUID, user: User = Depends(get_current_user)
) -> Response:
    with get_session() as session:
        svc.activate_price_item(session, event_id, price_item_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{event_id}/members", response_model=list[MemberOut])
def list_members(
    event_id: uuid.UUID, user: User = Depends(get_current_user)
) -> list[MemberOut]:
    with get_session() as session:
        return svc.list_members(session, event_id, user)
