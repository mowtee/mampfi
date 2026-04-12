import uuid

from fastapi import APIRouter, Depends, Response, status

from ..auth import get_current_user
from ..db import get_session
from ..models import User
from ..schemas.members import LeaveIntentIn, LeaveIntentOut
from ..services import members as svc

router = APIRouter(prefix="/v1/events/{event_id}/members", tags=["members"])


@router.post("/me/leave-intent", response_model=LeaveIntentOut)
def set_leave_intent(
    event_id: uuid.UUID, data: LeaveIntentIn, user: User = Depends(get_current_user)
) -> LeaveIntentOut:
    with get_session() as session:
        return svc.set_leave_intent(session, event_id, data.wants_to_leave, user)


@router.post("/me/leave", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def leave_event(event_id: uuid.UUID, user: User = Depends(get_current_user)) -> Response:
    with get_session() as session:
        svc.leave_event(session, event_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
