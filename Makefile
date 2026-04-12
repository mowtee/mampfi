SHELL := /bin/bash

.PHONY: help db-up db-down db-reset dev-api dev-web migrate seed \
        lint-api lint-web format-api format-web test-api test-web

help:
	@echo "Targets:"
	@echo "  db-up        - Start local Postgres container (named volume)"
	@echo "  db-down      - Stop and remove Postgres container"
	@echo "  db-reset     - Remove Postgres data volume (DANGEROUS)"
	@echo "  dev-api      - Run FastAPI locally via uv"
	@echo "  dev-web      - Run Vite dev server"
	@echo "  migrate      - Run Alembic migrations (upgrade head)"
	@echo "  seed         - Run backend seed script"
	@echo "  lint-api     - Lint backend with ruff"
	@echo "  lint-web     - Lint frontend with eslint"
	@echo "  format-api   - Format backend with ruff"
	@echo "  format-web   - Format frontend with prettier"
	@echo "  test-api     - Run backend tests (pytest)"
	@echo "  test-web     - Run frontend tests (vitest)"

db-up:
	@if docker ps -a --format '{{.Names}}' | grep -q '^mampfi-db$$'; then \
		echo "Starting existing container 'mampfi-db'..."; docker start mampfi-db >/dev/null; \
	else \
		echo "Creating and starting Postgres container 'mampfi-db'..."; \
		docker run -d --name mampfi-db \
		  -e POSTGRES_USER=mampfi -e POSTGRES_PASSWORD=mampfi -e POSTGRES_DB=mampfi \
		  -p 5432:5432 -v mampfi_pgdata:/var/lib/postgresql/data \
		  postgres:18-alpine >/dev/null; \
	fi; \
	echo "Postgres running on localhost:5432 (DB=mampfi, user=mampfi)"

db-down:
	-@docker stop mampfi-db >/dev/null 2>&1 || true
	-@docker rm mampfi-db >/dev/null 2>&1 || true
	@echo "Stopped and removed container 'mampfi-db'."

db-reset: db-down
	-@docker volume rm mampfi_pgdata >/dev/null 2>&1 || true
	@echo "Removed volume 'mampfi_pgdata'."

dev-api:
	cd backend && uv sync && \
	ENV=development CORS_ORIGINS=http://localhost:5173 \
	uv run uvicorn mampfi_api.main:app --reload --host 0.0.0.0 --port 8000

dev-web:
	cd frontend && pnpm install && pnpm dev

migrate:
	cd backend && uv run alembic upgrade head

seed:
	cd backend && uv run python -m mampfi_api.scripts.seed

lint-api:
	cd backend && uv run ruff check src && uv run ruff format --check src

lint-web:
	cd frontend && pnpm lint

format-api:
	cd backend && uv run ruff format src && uv run ruff check --fix src

format-web:
	cd frontend && pnpm format

test-api:
	cd backend && uv run pytest tests/ -q

test-web:
	cd frontend && pnpm test --run
