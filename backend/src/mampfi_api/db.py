from __future__ import annotations

from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlmodel import Session
from .config import get_settings


def get_engine() -> Engine:
    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
    return engine


@contextmanager
def get_session() -> Session:
    engine = get_engine()
    with Session(engine) as session:
        yield session
