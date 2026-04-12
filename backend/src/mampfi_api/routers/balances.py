import uuid

from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..db import get_session
from ..models import User
from ..schemas.balances import BalancesOut
from ..services import balances as svc

router = APIRouter(prefix="/v1/events/{event_id}", tags=["balances"])


@router.get("/balances", response_model=BalancesOut)
def get_balances(event_id: uuid.UUID, user: User = Depends(get_current_user)) -> BalancesOut:
    with get_session() as session:
        return svc.get_balances(session, event_id, user)
