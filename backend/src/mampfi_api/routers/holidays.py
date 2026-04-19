from __future__ import annotations

import json
import time
import urllib.request

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/v1", tags=["holidays"])

_CACHE: dict[str, tuple[float, list[dict]]] = {}
_TTL_SECONDS = 24 * 3600


def _cache_key(country: str, year: int, region: str | None) -> str:
    return f"{country}:{year}:{region or ''}"


def _fetch_public_holidays(country: str, year: int) -> list[dict]:
    url = f"https://date.nager.at/api/v3/publicholidays/{year}/{country}"
    try:
        with urllib.request.urlopen(url, timeout=6) as resp:  # nosec B310
            data = resp.read().decode("utf-8")
            return json.loads(data)
    except Exception as e:  # pragma: no cover
        raise HTTPException(
            status_code=502, detail=f"holiday source error: {e.__class__.__name__}"
        ) from e


@router.get("/holidays")
def get_holidays(
    country: str = Query(
        ...,
        min_length=2,
        max_length=8,
        pattern=r"^[A-Za-z]{2,8}$",
        description="ISO 3166-1 alpha-2 country code",
    ),
    year: int = Query(..., ge=1900, le=2100),
    region: str | None = Query(
        None,
        min_length=2,
        max_length=16,
        pattern=r"^[A-Za-z0-9-]{2,16}$",
        description="Optional regional/county code",
    ),
) -> list[dict]:
    country = country.upper()
    region = region.upper() if region else None

    key_all = _cache_key(country, year, None)
    now = time.time()
    data_all: list[dict] | None = None
    if key_all in _CACHE and now - _CACHE[key_all][0] < _TTL_SECONDS:
        data_all = _CACHE[key_all][1]
    if data_all is None:
        data_all = _fetch_public_holidays(country, year)
        _CACHE[key_all] = (now, data_all)

    # Filter: only types containing "Public"
    filtered = [h for h in data_all if any(t.lower() == "public" for t in (h.get("types") or []))]

    if region:
        region = region.upper()
        out = []
        for h in filtered:
            if h.get("global") is True:
                out.append(h)
                continue
            counties = h.get("counties") or []
            if region in counties:
                out.append(h)
        return out
    else:
        # Without region: include only global holidays
        return [h for h in filtered if h.get("global") is True]
