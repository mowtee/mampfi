from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from ..config import Settings, get_settings

router = APIRouter(tags=["legal"])

ALLOWED_SLUGS = {"privacy", "terms", "legal-notice"}


@router.get("/v1/legal/{slug}")
def get_legal_page(slug: str, settings: Settings = Depends(get_settings)) -> PlainTextResponse:
    if not settings.legal_enabled or slug not in ALLOWED_SLUGS:
        return PlainTextResponse("", status_code=404)
    path = Path(settings.legal_dir) / f"{slug}.md"
    if not path.is_file():
        return PlainTextResponse("", status_code=404)
    return PlainTextResponse(path.read_text(encoding="utf-8"))
