from __future__ import annotations

import datetime as dt
from typing import Optional


def now_utc() -> dt.datetime:
    """Return an aware UTC datetime.

    Use instead of deprecated datetime.utcnow().
    """
    # Python 3.11+ provides datetime.UTC; fallback to timezone.utc if needed
    try:
        utc = dt.UTC  # type: ignore[attr-defined]
    except AttributeError:
        utc = dt.timezone.utc
    return dt.datetime.now(utc)


def ensure_utc(d: dt.datetime) -> dt.datetime:
    """Coerce a datetime to aware UTC.

    - Naive datetimes are interpreted as UTC.
    - Aware non-UTC datetimes are converted to UTC.
    - Aware UTC datetimes are returned as-is.
    """
    if d.tzinfo is None:
        return now_utc().replace(
            year=d.year,
            month=d.month,
            day=d.day,
            hour=d.hour,
            minute=d.minute,
            second=d.second,
            microsecond=d.microsecond,
        )
    return d.astimezone(dt.timezone.utc)

