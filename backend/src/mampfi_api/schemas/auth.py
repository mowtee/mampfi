import uuid

from pydantic import BaseModel, EmailStr, Field


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=200)
    locale: str | None = Field(default=None, max_length=10)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailIn(BaseModel):
    token: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class AuthUserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str | None = None
    locale: str | None = None
    email_verified: bool


class DeleteAccountIn(BaseModel):
    confirmation: str = Field(min_length=1, max_length=320)
