from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import get_current_user
from ..models import User

router = APIRouter(tags=["me"])


class MeOut(BaseModel):
    id: str
    email: str
    name: str | None = None
    locale: str | None = None


@router.get("/v1/me", response_model=MeOut)
def get_me(user: User = Depends(get_current_user)) -> MeOut:
    return MeOut(id=str(user.id), email=user.email, name=user.name, locale=user.locale)
