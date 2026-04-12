import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Query, status

from ..auth import get_current_user
from ..db import get_session
from ..models import User
from ..schemas.purchases import PurchaseCreateIn, PurchaseOut
from ..services import purchases as svc

router = APIRouter(prefix="/v1/events/{event_id}/purchases", tags=["purchases"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PurchaseOut)
def finalize_purchase(
    event_id: uuid.UUID, data: PurchaseCreateIn, user: User = Depends(get_current_user)
) -> PurchaseOut:
    with get_session() as session:
        return svc.finalize_purchase(session, event_id, data, user)


@router.get("/{for_date}", response_model=PurchaseOut)
def get_purchase(
    event_id: uuid.UUID, for_date: dt.date, user: User = Depends(get_current_user)
) -> PurchaseOut:
    with get_session() as session:
        return svc.get_purchase(session, event_id, for_date, user)


@router.get("", response_model=list[PurchaseOut])
def list_purchases(
    event_id: uuid.UUID,
    start_date: dt.date | None = Query(default=None),
    end_date: dt.date | None = Query(default=None),
    user: User = Depends(get_current_user),
) -> list[PurchaseOut]:
    with get_session() as session:
        return svc.list_purchases(session, event_id, user, start_date, end_date)
