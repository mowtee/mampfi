import jwt
from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlmodel import Session, select

from .config import get_settings
from .db import session_dep
from .models import User
from .services.auth import decode_access_token


def get_current_user(
    session: Session = Depends(session_dep),
    access_token: str | None = Cookie(default=None),
    x_dev_user_email: str | None = Header(default=None, alias="X-Dev-User"),
) -> User:
    """Authenticate the current user.

    Development: X-Dev-User header (auto-creates user).
    Production: JWT access_token cookie.
    """
    settings = get_settings()

    # Dev mode: allow X-Dev-User header (keeps existing tests working)
    if settings.env == "development" and x_dev_user_email:
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

    # Production path: JWT cookie
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        user_id = decode_access_token(access_token, settings.secret_key)
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired or invalid"
        ) from exc

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
