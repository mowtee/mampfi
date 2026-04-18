from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from ..auth import get_current_user
from ..db import session_dep
from ..models import User

router = APIRouter(tags=["me"])


class MeOut(BaseModel):
    id: str
    email: str
    name: str | None = None
    locale: str | None = None


class UpdateMeIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


@router.get("/v1/me", response_model=MeOut)
def get_me(user: User = Depends(get_current_user)) -> MeOut:
    return MeOut(id=str(user.id), email=user.email, name=user.name, locale=user.locale)


@router.patch("/v1/me", response_model=MeOut)
def update_me(
    data: UpdateMeIn,
    session: Session = Depends(session_dep),
    user: User = Depends(get_current_user),
) -> MeOut:
    user.name = data.name.strip()
    session.add(user)
    session.commit()
    session.refresh(user)
    return MeOut(id=str(user.id), email=user.email, name=user.name, locale=user.locale)
