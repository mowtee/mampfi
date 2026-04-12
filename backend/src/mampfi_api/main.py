from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import get_settings
from .db import get_engine
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


@app.get("/health")
def health() -> dict:
    # Basic DB connectivity check
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
