import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from ..auth import get_current_user
from ..db import session_dep
from ..models import User
from ..schemas.members import LeaveIntentIn, LeaveIntentOut, MemberNoteIn, RolloverIn
from ..services import members as svc

router = APIRouter(prefix="/v1/events/{event_id}/members", tags=["members"])


@router.post("/me/leave-intent", response_model=LeaveIntentOut)
def set_leave_intent(
    event_id: uuid.UUID,
    data: LeaveIntentIn,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> LeaveIntentOut:
    return svc.set_leave_intent(session, event_id, data.wants_to_leave, user)


@router.post("/me/leave", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def leave_event(
    event_id: uuid.UUID,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Response:
    svc.leave_event(session, event_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/remove", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def remove_member(
    event_id: uuid.UUID,
    user_id: uuid.UUID,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Response:
    svc.remove_member(session, event_id, user_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/promote", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def promote_member(
    event_id: uuid.UUID,
    user_id: uuid.UUID,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Response:
    svc.promote_member(session, event_id, user_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/note")
def set_member_note(
    event_id: uuid.UUID,
    data: MemberNoteIn,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> dict:
    return svc.set_member_note(session, event_id, data.note, user)


@router.post("/me/rollover")
def set_rollover(
    event_id: uuid.UUID,
    data: RolloverIn,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> dict:
    return svc.set_rollover(session, event_id, data.enabled, user)
