import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Query, Response, UploadFile, status
from sqlmodel import Session

from ..auth import get_current_user
from ..db import session_dep
from ..models import User
from ..schemas.purchases import InvalidatePurchaseIn, PurchaseCreateIn, PurchaseOut
from ..services import purchases as svc

router = APIRouter(prefix="/v1/events/{event_id}/purchases", tags=["purchases"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PurchaseOut)
def finalize_purchase(
    event_id: uuid.UUID,
    data: PurchaseCreateIn,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> PurchaseOut:
    return svc.finalize_purchase(session, event_id, data, user)


@router.get("/{for_date}", response_model=PurchaseOut)
def get_purchase(
    event_id: uuid.UUID,
    for_date: dt.date,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> PurchaseOut:
    return svc.get_purchase(session, event_id, for_date, user)


@router.get("", response_model=list[PurchaseOut])
def list_purchases(
    event_id: uuid.UUID,
    start_date: dt.date | None = Query(default=None),
    end_date: dt.date | None = Query(default=None),
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> list[PurchaseOut]:
    return svc.list_purchases(session, event_id, user, start_date, end_date)


@router.post("/{for_date}/invalidate", response_model=PurchaseOut)
def invalidate_purchase(
    event_id: uuid.UUID,
    for_date: dt.date,
    data: InvalidatePurchaseIn,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> PurchaseOut:
    return svc.invalidate_purchase(session, event_id, for_date, data, user)


@router.post("/{for_date}/receipt", response_model=PurchaseOut)
async def upload_receipt(
    event_id: uuid.UUID,
    for_date: dt.date,
    file: UploadFile,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> PurchaseOut:
    data = await file.read()
    return svc.upload_receipt(session, event_id, for_date, data, file.content_type or "", user)


@router.get("/{for_date}/receipt")
def get_receipt(
    event_id: uuid.UUID,
    for_date: dt.date,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Response:
    data_url = svc.get_receipt(session, event_id, for_date, user)
    # data_url is "data:image/jpeg;base64,..."
    import base64

    header, b64 = data_url.split(",", 1)
    content_type = header.split(":")[1].split(";")[0]
    return Response(content=base64.b64decode(b64), media_type=content_type)
