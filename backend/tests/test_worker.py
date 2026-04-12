"""Tests for the email outbox worker."""

from unittest.mock import patch

from sqlalchemy.engine import Engine
from sqlmodel import Session

from mampfi_api.config import get_settings
from mampfi_api.models import EmailOutbox
from mampfi_api.worker import process_outbox


def test_process_outbox_sends_pending(session: Session, engine: Engine):
    msg = EmailOutbox(
        to_email="test@example.com",
        subject="Test Subject",
        body_html="<p>Hello</p>",
        body_text="Hello",
    )
    session.add(msg)
    session.commit()

    settings = get_settings()
    with patch("mampfi_api.worker.send_email") as mock_send:
        count = process_outbox(engine, settings)

    assert count == 1
    mock_send.assert_called_once()

    session.refresh(msg)
    assert msg.sent_at is not None


def test_process_outbox_retries_on_failure(session: Session, engine: Engine):
    msg = EmailOutbox(
        to_email="fail@example.com",
        subject="Fail",
        body_html="<p>Fail</p>",
    )
    session.add(msg)
    session.commit()

    settings = get_settings()
    with patch("mampfi_api.worker.send_email", side_effect=ConnectionError("SMTP down")):
        count = process_outbox(engine, settings)

    assert count == 0
    session.refresh(msg)
    assert msg.attempts == 1
    assert msg.sent_at is None
    assert msg.failed_at is None  # not permanently failed yet


def test_process_outbox_marks_failed_after_5_attempts(session: Session, engine: Engine):
    msg = EmailOutbox(
        to_email="fail@example.com",
        subject="Fail",
        body_html="<p>Fail</p>",
    )
    msg.attempts = 4  # next failure will be the 5th
    session.add(msg)
    session.commit()

    settings = get_settings()
    with patch("mampfi_api.worker.send_email", side_effect=ConnectionError("SMTP down")):
        process_outbox(engine, settings)

    session.refresh(msg)
    assert msg.attempts == 5
    assert msg.failed_at is not None
