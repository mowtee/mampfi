"""Email outbox: enqueue emails using Jinja2 templates and i18n strings."""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from sqlmodel import Session

from ..i18n import get_lang, t
from ..models import EmailOutbox, User

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"
_jinja = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)), autoescape=True)


def _render(template_name: str, **ctx: str) -> str:
    return _jinja.get_template(template_name).render(**ctx)


def enqueue_email(
    session: Session, to: str, subject: str, body_html: str, body_text: str | None = None
) -> EmailOutbox:
    msg = EmailOutbox(to_email=to, subject=subject, body_html=body_html, body_text=body_text)
    session.add(msg)
    return msg


def enqueue_verification_email(
    session: Session, user: User, token: str, frontend_url: str
) -> EmailOutbox:
    lang = get_lang(user.locale)
    name = user.name or user.email
    link = f"{frontend_url}/verify-email?token={token}"

    subject = t("verify_subject", lang)
    ctx = dict(
        lang=lang,
        greeting=t("greeting", lang),
        name=name,
        body=t("verify_body", lang),
        link=link,
        cta=t("verify_cta", lang),
        fallback=t("verify_fallback", lang),
        expiry_note=t("verify_expiry", lang),
    )
    body_html = _render("email/verify.html", **ctx)
    body_text = _render("email/verify.txt", **ctx)
    return enqueue_email(session, user.email, subject, body_html, body_text)


def enqueue_password_reset_email(
    session: Session, user: User, token: str, frontend_url: str
) -> EmailOutbox:
    lang = get_lang(user.locale)
    name = user.name or user.email
    link = f"{frontend_url}/reset-password?token={token}"

    subject = t("reset_subject", lang)
    ctx = dict(
        lang=lang,
        greeting=t("greeting", lang),
        name=name,
        body=t("reset_body", lang),
        link=link,
        cta=t("reset_cta", lang),
        fallback=t("reset_fallback", lang),
        expiry_note=t("reset_expiry", lang),
        ignore_note=t("reset_ignore", lang),
    )
    body_html = _render("email/reset_password.html", **ctx)
    body_text = _render("email/reset_password.txt", **ctx)
    return enqueue_email(session, user.email, subject, body_html, body_text)
