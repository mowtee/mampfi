import logging
import time

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import get_settings
from .db import get_engine
from .exceptions import Conflict, DomainError, Forbidden, NotFound
from .logging import setup_logging
from .routers import balances as balances_router
from .routers import events as events_router
from .routers import holidays as holidays_router
from .routers import invites as invites_router
from .routers import me as me_router
from .routers import members as members_router
from .routers import orders as orders_router
from .routers import payments as payments_router
from .routers import purchases as purchases_router

settings = get_settings()
setup_logging(level=settings.log_level, json_output=settings.env != "development")

logger = logging.getLogger("mampfi_api")

app = FastAPI(title="Mampfi API", version="0.1.0")

if settings.cors_origins:
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
else:
    origins = []

if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:  # type: ignore[type-arg]
    start = time.monotonic()
    response: Response = await call_next(request)
    duration_ms = round((time.monotonic() - start) * 1000, 1)
    logger.info(
        "%s %s %s %.1fms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


@app.exception_handler(NotFound)
def not_found_handler(request: Request, exc: NotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": f"{exc.resource} not found"})


@app.exception_handler(Forbidden)
def forbidden_handler(request: Request, exc: Forbidden) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": exc.detail})


@app.exception_handler(Conflict)
def conflict_handler(request: Request, exc: Conflict) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": exc.detail})


@app.exception_handler(DomainError)
def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": exc.detail})


@app.get("/health")
def health() -> dict:
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        db = "ok"
    except Exception as e:  # pragma: no cover
        db = f"error: {e.__class__.__name__}"
    return {"status": "ok", "db": db}


app.include_router(events_router.router)
app.include_router(purchases_router.router)
app.include_router(orders_router.router)
app.include_router(invites_router.router)
app.include_router(payments_router.router)
app.include_router(balances_router.router)
app.include_router(members_router.router)
app.include_router(me_router.router)
app.include_router(holidays_router.router)


@app.get("/v1/info")
def info() -> dict:
    return {
        "name": "mampfi",
        "version": "0.1.0",
        "env": settings.env,
    }
