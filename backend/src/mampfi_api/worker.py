"""Email outbox worker: polls for pending emails and sends them via SMTP."""

import asyncio
import datetime as dt
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from .config import Settings, get_settings
from .logging import setup_logging
from .models import EmailOutbox, RefreshToken
from .timeutils import now_utc

logger = logging.getLogger("mampfi_api.worker")


def send_email(
    settings: Settings, to: str, subject: str, body_html: str, body_text: str | None = None
) -> None:
    if not settings.smtp_host or not settings.mail_from:
        logger.warning("SMTP not configured — skipping email to %s: %s", to, subject)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.mail_from
    msg["To"] = to
    if body_text:
        msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    port = settings.smtp_port or 587
    if port == 465:
        # Implicit SSL (SMTPS)
        with smtplib.SMTP_SSL(settings.smtp_host, port) as server:
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password or "")
            server.send_message(msg)
    else:
        # STARTTLS (typically port 587)
        with smtplib.SMTP(settings.smtp_host, port) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password or "")
            server.send_message(msg)


def process_outbox(engine: Engine, settings: Settings) -> int:
    """Process pending outbox rows. Returns count of emails sent."""
    now = now_utc()
    with Session(engine) as session:
        pending = session.exec(
            select(EmailOutbox)
            .where(
                EmailOutbox.sent_at.is_(None),  # type: ignore[union-attr]
                EmailOutbox.failed_at.is_(None),  # type: ignore[union-attr]
                EmailOutbox.next_attempt_at <= now,
                EmailOutbox.attempts < 5,
            )
            .order_by(EmailOutbox.created_at)
            .limit(10)
        ).all()

        count = 0
        for msg in pending:
            try:
                send_email(settings, msg.to_email, msg.subject, msg.body_html, msg.body_text)
                msg.sent_at = now
                count += 1
                logger.info("Sent email to %s: %s", msg.to_email, msg.subject)
            except Exception:
                msg.attempts += 1
                msg.error = str(msg.error)[:500] if msg.error else None
                if msg.attempts >= 5:
                    msg.failed_at = now
                    logger.error("Email to %s failed permanently after 5 attempts", msg.to_email)
                else:
                    delay = 30 * (4 ** (msg.attempts - 1))
                    msg.next_attempt_at = now + dt.timedelta(seconds=delay)
                    logger.warning(
                        "Email to %s failed (attempt %d), retrying in %ds",
                        msg.to_email,
                        msg.attempts,
                        delay,
                    )
            session.add(msg)
        session.commit()
        return count


def cleanup(engine: Engine) -> None:
    """Remove old sent outbox rows and expired refresh tokens."""
    cutoff = now_utc() - dt.timedelta(days=7)
    with Session(engine) as session:
        old_sent = session.exec(
            select(EmailOutbox).where(
                EmailOutbox.sent_at.is_not(None),  # type: ignore[union-attr]
                EmailOutbox.sent_at < cutoff,  # type: ignore[operator]
            )
        ).all()
        for msg in old_sent:
            session.delete(msg)

        expired = session.exec(
            select(RefreshToken).where(RefreshToken.expires_at < now_utc())
        ).all()
        for rt in expired:
            session.delete(rt)

        session.commit()
        if old_sent or expired:
            logger.info(
                "Cleanup: removed %d old emails, %d expired tokens",
                len(old_sent),
                len(expired),
            )


async def main() -> None:
    settings = get_settings()
    setup_logging(level=settings.log_level, json_output=settings.env != "development")
    logger.info("Worker started. Polling outbox every 5s.")

    engine = create_engine(settings.database_url, pool_pre_ping=True)
    last_cleanup = now_utc()

    while True:
        try:
            process_outbox(engine, settings)
        except Exception:
            logger.exception("Outbox processing error")

        if (now_utc() - last_cleanup).total_seconds() > 3600:
            try:
                cleanup(engine)
            except Exception:
                logger.exception("Cleanup error")
            last_cleanup = now_utc()

        await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(main())
