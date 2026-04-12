from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session, select

from .db import session_dep
from .models import User


def get_current_user(
    session: Session = Depends(session_dep),
    x_dev_user_email: str | None = Header(default=None, alias="X-Dev-User"),
) -> User:
    """DEV-ONLY auth: identify the user by email from X-Dev-User header.

    - If user exists, return it; otherwise create a minimal user record.
    - In production, replace with invite-based signup + session cookies.
    """
    if not x_dev_user_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing X-Dev-User header"
        )
    email = x_dev_user_email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid X-Dev-User email"
        )

    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        user = User(email=email)
        session.add(user)
        session.commit()
        session.refresh(user)
    return user
