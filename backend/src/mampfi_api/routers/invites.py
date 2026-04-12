import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlmodel import Session

from ..auth import get_current_user
from ..db import session_dep
from ..models import User
from ..schemas.invites import GroupInviteIn, InviteOut, RedeemIn, SingleInviteIn
from ..services import invites as svc

router = APIRouter(tags=["invites"])


@router.post("/v1/events/{event_id}/invites/group")
def create_or_rotate_group_invite(
    event_id: uuid.UUID,
    data: GroupInviteIn,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> dict:
    invite, raw = svc.create_group_invite(session, event_id, data, user)
    return {
        "invite": invite.model_dump(),
        "token": raw,
        "invite_url": f"/join?token={raw}",
    }


@router.post("/v1/events/{event_id}/invites/single")
def create_single_invite(
    event_id: uuid.UUID,
    data: SingleInviteIn,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> dict:
    invite, raw = svc.create_single_invite(session, event_id, data, user)
    return {
        "invite": invite.model_dump(),
        "token": raw,
        "invite_url": f"/join?token={raw}",
    }


@router.get("/v1/events/{event_id}/invites", response_model=list[InviteOut])
def list_invites(
    event_id: uuid.UUID,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> list[InviteOut]:
    return svc.list_invites(session, event_id, user)


@router.post(
    "/v1/events/{event_id}/invites/{invite_id}/revoke",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def revoke_invite(
    event_id: uuid.UUID,
    invite_id: uuid.UUID,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> Response:
    svc.revoke_invite(session, event_id, invite_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/v1/invites/redeem")
def redeem_invite(
    data: RedeemIn,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> dict:
    return svc.redeem_invite(session, data.token, user)


@router.get("/v1/invites/preview")
def preview_invite(
    token: str,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> dict:
    return svc.preview_invite(session, token, user)
