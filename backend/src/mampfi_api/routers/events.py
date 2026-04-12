from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlmodel import select

from ..auth import get_current_user
from ..db import get_session
from ..models import Event, Membership, PriceItem, User
from ..timeutils import now_utc

router = APIRouter(prefix="/v1/events", tags=["events"])


class PriceItemCreate(BaseModel):
    name: str
    unit_price_minor: int
    active: bool | None = True


class EventCreate(BaseModel):
    name: str
    description: str | None = None
    start_date: dt.date
    end_date: dt.date
    timezone: str
    cutoff_time: dt.time
    currency: str
    price_items: list[PriceItemCreate]
    holiday_country_code: str | None = None
    holiday_region_code: str | None = None


@router.post("", response_model=Event, status_code=status.HTTP_201_CREATED)
def create_event(data: EventCreate, user: User = Depends(get_current_user)) -> Event:
    # Basic validations
    if data.start_date > data.end_date:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    cur = (data.currency or "").upper()
    if len(cur) != 3:
        raise HTTPException(status_code=400, detail="currency must be 3 letters ISO code")

    with get_session() as session:
        event = Event(
            name=data.name,
            description=data.description,
            start_date=data.start_date,
            end_date=data.end_date,
            timezone=data.timezone,
            cutoff_time=data.cutoff_time,
            currency=cur,
            holiday_country_code=(data.holiday_country_code or None),
            holiday_region_code=(data.holiday_region_code or None),
        )
        session.add(event)
        session.flush()

        # Add membership for creator as owner
        session.add(
            Membership(user_id=user.id, event_id=event.id, role="owner", joined_at=now_utc())
        )

        # Insert price items (read-only after creation per requirements)
        for item in data.price_items:
            session.add(
                PriceItem(
                    event_id=event.id,
                    name=item.name,
                    unit_price_minor=item.unit_price_minor,
                    active=True if item.active is None else item.active,
                )
            )
        session.commit()
        session.refresh(event)
        return event


class EventWithMe(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    start_date: dt.date
    end_date: dt.date
    timezone: str
    cutoff_time: dt.time
    currency: str
    holiday_country_code: str | None = None
    holiday_region_code: str | None = None
    # Membership info for current user
    left_at: dt.datetime | None = None


@router.get("", response_model=list[EventWithMe])
def list_my_events(user: User = Depends(get_current_user)) -> list[EventWithMe]:
    with get_session() as session:
        mems = session.exec(select(Membership).where(Membership.user_id == user.id)).all()
        event_ids = [m.event_id for m in mems]
        events = (
            session.exec(select(Event).where(Event.id.in_(event_ids))).all() if event_ids else []
        )
        mem_by_event = {m.event_id: m for m in mems}
        out: list[EventWithMe] = []
        for ev in events:
            m = mem_by_event.get(ev.id)
            out.append(
                EventWithMe(
                    id=ev.id,
                    name=ev.name,
                    description=ev.description,
                    start_date=ev.start_date,
                    end_date=ev.end_date,
                    timezone=ev.timezone,
                    cutoff_time=ev.cutoff_time,
                    currency=ev.currency,
                    holiday_country_code=ev.holiday_country_code,
                    holiday_region_code=ev.holiday_region_code,
                    left_at=m.left_at if m else None,
                )
            )
        return out


@router.get("/{event_id}", response_model=Event)
def get_event(event_id: uuid.UUID, user: User = Depends(get_current_user)) -> Event:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")
        return ev


class EventUpdate(BaseModel):
    holiday_country_code: str | None = None
    holiday_region_code: str | None = None


@router.patch("/{event_id}", response_model=Event)
def update_event(
    event_id: uuid.UUID, data: EventUpdate, user: User = Depends(get_current_user)
) -> Event:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member or member.role != "owner":
            raise HTTPException(status_code=403, detail="owner role required")
        if data.holiday_country_code is not None:
            ev.holiday_country_code = data.holiday_country_code or None
        if data.holiday_region_code is not None:
            ev.holiday_region_code = data.holiday_region_code or None
        session.add(ev)
        session.commit()
        session.refresh(ev)
        return ev


@router.get("/{event_id}/price-items", response_model=list[PriceItem])
def list_price_items(
    event_id: uuid.UUID,
    user: User = Depends(get_current_user),
    include_inactive: bool = Query(default=False),
) -> list[PriceItem]:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")
        stmt = select(PriceItem).where(PriceItem.event_id == ev.id)
        if not include_inactive:
            stmt = stmt.where(PriceItem.active == True)  # noqa: E712
        items = session.exec(stmt).all()
        return list(items)


class PriceItemAdd(BaseModel):
    name: str
    unit_price_minor: int


@router.post(
    "/{event_id}/price-items", response_model=PriceItem, status_code=status.HTTP_201_CREATED
)
def add_price_item(
    event_id: uuid.UUID, data: PriceItemAdd, user: User = Depends(get_current_user)
) -> PriceItem:
    if data.unit_price_minor <= 0:
        raise HTTPException(status_code=400, detail="unit_price_minor must be > 0")
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")
        if member.role != "owner":
            raise HTTPException(status_code=403, detail="owner role required")
        item = PriceItem(
            event_id=ev.id, name=data.name, unit_price_minor=int(data.unit_price_minor), active=True
        )
        session.add(item)
        session.commit()
        session.refresh(item)
        return item


@router.post(
    "/{event_id}/price-items/{price_item_id}/deactivate",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def deactivate_price_item(
    event_id: uuid.UUID, price_item_id: uuid.UUID, user: User = Depends(get_current_user)
) -> Response:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")
        if member.role != "owner":
            raise HTTPException(status_code=403, detail="owner role required")
        item = session.get(PriceItem, price_item_id)
        if not item or item.event_id != ev.id:
            raise HTTPException(status_code=404, detail="price item not found")
        item.active = False
        session.add(item)
        session.commit()
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
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        member = session.get(Membership, (user.id, ev.id))
        if not member:
            raise HTTPException(status_code=403, detail="not a member of this event")
        if member.role != "owner":
            raise HTTPException(status_code=403, detail="owner role required")
        item = session.get(PriceItem, price_item_id)
        if not item or item.event_id != ev.id:
            raise HTTPException(status_code=404, detail="price item not found")
        item.active = True
        session.add(item)
        session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str | None = None
    name: str | None = None
    role: str
    joined_at: dt.datetime
    left_at: dt.datetime | None = None


@router.get("/{event_id}/members", response_model=list[MemberOut])
def list_members(event_id: uuid.UUID, user: User = Depends(get_current_user)) -> list[MemberOut]:
    with get_session() as session:
        ev = session.get(Event, event_id)
        if ev is None:
            raise HTTPException(status_code=404, detail="event not found")
        # requester must be a member
        if not session.get(Membership, (user.id, ev.id)):
            raise HTTPException(status_code=403, detail="not a member of this event")
        # join memberships to users
        mems = session.exec(select(Membership).where(Membership.event_id == ev.id)).all()
        # collect user ids
        user_ids = [m.user_id for m in mems]
        users = {}
        if user_ids:
            for u in session.exec(select(User).where(User.id.in_(user_ids))).all():
                users[u.id] = u
        out: list[MemberOut] = []
        for m in mems:
            u = users.get(m.user_id)
            out.append(
                MemberOut(
                    user_id=m.user_id,
                    email=(u.email if u else None),
                    name=(u.name if u else None),
                    role=m.role,
                    joined_at=m.joined_at,
                    left_at=m.left_at,
                )
            )
        return out
