import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Query, status

from ..auth import get_current_user
from ..db import get_session
from ..models import User
from ..schemas.orders import AggregateOut, OrderOut, OrderUpsertIn
from ..services import orders as svc

router = APIRouter(prefix="/v1/events/{event_id}/orders", tags=["orders"])


@router.put("/{for_date}/me", status_code=status.HTTP_200_OK)
def upsert_my_order(
    event_id: uuid.UUID,
    for_date: dt.date,
    data: OrderUpsertIn,
    user: User = Depends(get_current_user),
) -> dict:
    with get_session() as session:
        svc.upsert_order(session, event_id, for_date, data, user)
    return {"status": "ok"}


@router.get("/{for_date}/me", response_model=OrderOut)
def get_my_order(
    event_id: uuid.UUID, for_date: dt.date, user: User = Depends(get_current_user)
) -> OrderOut:
    with get_session() as session:
        return svc.get_my_order(session, event_id, for_date, user)


@router.get("/aggregate", response_model=AggregateOut)
def aggregate_orders(
    event_id: uuid.UUID,
    date: dt.date = Query(..., alias="date"),
    user: User = Depends(get_current_user),
) -> AggregateOut:
    with get_session() as session:
        return svc.aggregate_orders(session, event_id, date, user)
