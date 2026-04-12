"""Email outbox: enqueue emails using Jinja2 templates and i18n strings."""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from sqlmodel import Session

from ..i18n import get_lang, t
from ..models import EmailOutbox, Event, User

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"
_jinja = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)), autoescape=True)


def _logo_url(frontend_url: str) -> str:
    return f"{frontend_url.rstrip('/')}/logo.png"


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
        logo_url=_logo_url(frontend_url),
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
        logo_url=_logo_url(frontend_url),
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


# ---------------------------------------------------------------------------
# Domain notification emails
# ---------------------------------------------------------------------------


def _event_link(frontend_url: str, event_id: str) -> str:
    return f"{frontend_url}/events/{event_id}?tab=payments"


def enqueue_invite_email(
    session: Session,
    to_email: str,
    from_user: User,
    event: Event,
    raw_token: str,
    frontend_url: str,
    lang: str,
) -> EmailOutbox:
    from_name = from_user.name or from_user.email
    link = f"{frontend_url}/join?token={raw_token}"

    subject = t("invite_subject", lang, event_name=event.name)
    ctx = dict(
        lang=lang,
        logo_url=_logo_url(frontend_url),
        greeting=t("greeting", lang),
        body=t("invite_body", lang, from_name=from_name, event_name=event.name),
        link=link,
        cta=t("invite_cta", lang),
        fallback=t("invite_fallback", lang),
        expiry_note=t("invite_expiry", lang),
    )
    return enqueue_email(
        session,
        to_email,
        subject,
        _render("email/invite.html", **ctx),
        _render("email/invite.txt", **ctx),
    )


def notify_payment_created(
    session: Session,
    recipient: User,
    from_user: User,
    event: Event,
    amount_formatted: str,
    frontend_url: str,
) -> EmailOutbox:
    lang = get_lang(recipient.locale)
    name = recipient.name or recipient.email
    from_name = from_user.name or from_user.email
    link = _event_link(frontend_url, str(event.id))

    subject = t("payment_created_subject", lang, event_name=event.name)
    ctx = dict(
        lang=lang,
        logo_url=_logo_url(frontend_url),
        greeting=t("greeting", lang),
        name=name,
        body=t("payment_created_body", lang, from_name=from_name, amount=amount_formatted),
        link=link,
        cta=t("payment_created_cta", lang),
    )
    return enqueue_email(
        session,
        recipient.email,
        subject,
        _render("email/payment_created.html", **ctx),
        _render("email/payment_created.txt", **ctx),
    )


def notify_payment_confirmed(
    session: Session,
    recipient: User,
    to_user: User,
    event: Event,
    amount_formatted: str,
    frontend_url: str,
) -> EmailOutbox:
    lang = get_lang(recipient.locale)
    name = recipient.name or recipient.email
    to_name = to_user.name or to_user.email
    link = _event_link(frontend_url, str(event.id))

    subject = t("payment_confirmed_subject", lang, event_name=event.name)
    ctx = dict(
        lang=lang,
        logo_url=_logo_url(frontend_url),
        greeting=t("greeting", lang),
        name=name,
        body=t("payment_confirmed_body", lang, amount=amount_formatted, to_name=to_name),
        link=link,
        cta=t("payment_created_cta", lang),
    )
    return enqueue_email(
        session,
        recipient.email,
        subject,
        _render("email/payment_confirmed.html", **ctx),
        _render("email/payment_confirmed.txt", **ctx),
    )


def notify_purchase_finalized(
    session: Session,
    recipient: User,
    buyer: User,
    event: Event,
    date_str: str,
    total_formatted: str,
    frontend_url: str,
) -> EmailOutbox:
    lang = get_lang(recipient.locale)
    name = recipient.name or recipient.email
    buyer_name = buyer.name or buyer.email
    link = _event_link(frontend_url, str(event.id))

    subject = t("purchase_finalized_subject", lang, date=date_str)
    ctx = dict(
        lang=lang,
        logo_url=_logo_url(frontend_url),
        greeting=t("greeting", lang),
        name=name,
        body=t(
            "purchase_finalized_body",
            lang,
            buyer_name=buyer_name,
            date=date_str,
            total=total_formatted,
        ),
        link=link,
        cta=t("payment_created_cta", lang),
    )
    return enqueue_email(
        session,
        recipient.email,
        subject,
        _render("email/purchase_finalized.html", **ctx),
        _render("email/purchase_finalized.txt", **ctx),
    )
