# syntax=docker/dockerfile:1.7

FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PIP_NO_CACHE_DIR=1

RUN pip install uv

WORKDIR /app

FROM base AS builder
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev

FROM base AS runtime
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src:${PYTHONPATH}"
COPY --from=builder /app/src ./src
COPY alembic.ini ./
COPY alembic ./alembic

EXPOSE 8000
CMD ["uvicorn", "mampfi_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
