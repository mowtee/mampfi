from collections.abc import Generator as Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlmodel import Session

from .config import get_settings


def get_engine() -> Engine:
    settings = get_settings()
    return create_engine(settings.database_url, pool_pre_ping=True, future=True)


def session_dep() -> Generator[Session]:
    with Session(get_engine()) as session:
        yield session
