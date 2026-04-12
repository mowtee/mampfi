"""Email outbox: enqueue emails within the current transaction."""

from sqlmodel import Session

from ..models import EmailOutbox, User


def enqueue_email(
    session: Session, to: str, subject: str, body_html: str, body_text: str | None = None
) -> EmailOutbox:
    msg = EmailOutbox(to_email=to, subject=subject, body_html=body_html, body_text=body_text)
    session.add(msg)
    return msg


def enqueue_verification_email(
    session: Session, user: User, token: str, frontend_url: str
) -> EmailOutbox:
    name = user.name or user.email
    link = f"{frontend_url}/verify-email?token={token}"
    subject = "Verify your Mampfi account"
    body_html = (
        f"<p>Hi {name},</p>"
        f"<p>Click the link below to verify your email address:</p>"
        f'<p><a href="{link}">{link}</a></p>'
        f"<p>This link expires in 24 hours.</p>"
        f"<p>— Mampfi</p>"
    )
    body_text = f"Hi {name},\n\nVerify your email: {link}\n\nThis link expires in 24 hours."
    return enqueue_email(session, user.email, subject, body_html, body_text)


def enqueue_password_reset_email(
    session: Session, user: User, token: str, frontend_url: str
) -> EmailOutbox:
    name = user.name or user.email
    link = f"{frontend_url}/reset-password?token={token}"
    subject = "Reset your Mampfi password"
    body_html = (
        f"<p>Hi {name},</p>"
        f"<p>Click the link below to reset your password:</p>"
        f'<p><a href="{link}">{link}</a></p>'
        f"<p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>"
        f"<p>— Mampfi</p>"
    )
    body_text = (
        f"Hi {name},\n\nReset your password: {link}\n\n"
        f"This link expires in 1 hour. If you didn't request this, ignore this email."
    )
    return enqueue_email(session, user.email, subject, body_html, body_text)
