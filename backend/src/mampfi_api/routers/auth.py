"""Auth endpoints: signup, login, refresh, logout, email verification, password reset."""

from fastapi import APIRouter, Cookie, Depends, Response
from sqlmodel import Session

from ..auth import get_current_user
from ..config import Settings, get_settings
from ..db import session_dep
from ..models import User
from ..schemas.auth import (
    AuthUserOut,
    ForgotPasswordIn,
    LoginIn,
    ResetPasswordIn,
    SignupIn,
    VerifyEmailIn,
)
from ..services import auth as auth_svc

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _user_out(user) -> AuthUserOut:
    return AuthUserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        locale=user.locale,
        email_verified=user.email_verified_at is not None,
    )


def _set_auth_cookies(
    response: Response, access: str, raw_refresh: str, settings: Settings
) -> None:
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/v1/auth",
    )


def _clear_auth_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(key="access_token", path="/", secure=settings.cookie_secure)
    response.delete_cookie(key="refresh_token", path="/v1/auth", secure=settings.cookie_secure)


@router.post("/signup", status_code=201)
def signup(
    data: SignupIn,
    session: Session = Depends(session_dep),
    settings: Settings = Depends(get_settings),
) -> dict:
    auth_svc.signup(session, data.email, data.password, data.name, settings, locale=data.locale)
    return {"message": "Account created. Check your email to verify."}


@router.post("/login")
def login(
    data: LoginIn,
    response: Response,
    session: Session = Depends(session_dep),
    settings: Settings = Depends(get_settings),
) -> AuthUserOut:
    user, access, raw_refresh = auth_svc.login(session, data.email, data.password, settings)
    _set_auth_cookies(response, access, raw_refresh, settings)
    return _user_out(user)


@router.post("/refresh")
def refresh_token(
    response: Response,
    session: Session = Depends(session_dep),
    settings: Settings = Depends(get_settings),
    refresh_token: str | None = Cookie(default=None),
) -> AuthUserOut:
    if not refresh_token:
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="No refresh token")
    user, access, new_raw = auth_svc.refresh(session, refresh_token, settings)
    _set_auth_cookies(response, access, new_raw, settings)
    return _user_out(user)


@router.post("/logout")
def logout(
    response: Response,
    session: Session = Depends(session_dep),
    settings: Settings = Depends(get_settings),
    refresh_token: str | None = Cookie(default=None),
) -> dict:
    if refresh_token:
        auth_svc.logout(session, refresh_token)
    _clear_auth_cookies(response, settings)
    return {"message": "Logged out"}


@router.post("/verify-email")
def verify_email(
    data: VerifyEmailIn,
    session: Session = Depends(session_dep),
    settings: Settings = Depends(get_settings),
) -> dict:
    auth_svc.verify_email(session, data.token, settings.secret_key)
    return {"message": "Email verified"}


@router.post("/forgot-password")
def forgot_password(
    data: ForgotPasswordIn,
    session: Session = Depends(session_dep),
    settings: Settings = Depends(get_settings),
) -> dict:
    auth_svc.request_password_reset(session, data.email, settings)
    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(
    data: ResetPasswordIn,
    session: Session = Depends(session_dep),
    settings: Settings = Depends(get_settings),
) -> dict:
    auth_svc.reset_password(session, data.token, data.password, settings.secret_key)
    return {"message": "Password updated"}


@router.get("/me")
def auth_me(user: User = Depends(get_current_user)) -> AuthUserOut:
    return _user_out(user)
