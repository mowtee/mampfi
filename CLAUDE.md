# CLAUDE.md — Mampfi

Working instructions for Claude Code in this repository.

---

## Project Overview

**Mampfi** is a daily group order coordination app. Groups create events with a fixed price list; members place daily orders that roll over automatically. One member volunteers as buyer, finalizes actuals, and the app tracks virtual balances — no external payment processor. Payments are logged and require dual confirmation.

**Key domain rules:**
- Cutoff time locks next-day orders (event-local timezone, stored as UTC).
- Money is stored in minor units (integers). Currency is ISO 4217, fixed at event creation.
- Exactly one finalized purchase per (event, date).
- Payments require dual confirmation before settling balances.

---

## Repo Structure

```
backend/          FastAPI API + worker
frontend/         React/Vite SPA
infra/            Docker Compose, Caddyfile, deploy script
scripts/          One-off utility scripts
docs/             Requirements, refactor backlog, ADRs
assets/           Static assets
Makefile          Dev workflow shortcuts
```

---

## Development Setup

**Prerequisites:** `uv` (Python), `pnpm` (Node 20+), `docker`

```bash
# Start local Postgres
make db-up

# Run API (hot reload)
make dev-api

# Run frontend dev server
make dev-web

# Apply migrations
make migrate
```

**Backend deps:** `cd backend && uv sync` — creates `.venv` and `uv.lock`

**Frontend deps:** `cd frontend && pnpm install` — creates `pnpm-lock.yaml`

Both lockfiles (`uv.lock`, `pnpm-lock.yaml`) are committed to the repo.

---

## Planning Workflow

- **`docs/refactor.md`** — tracked refactor backlog, organized by area. Update status inline (`[ ]` → `[~]` → `[x]`). Add new items here before starting work.
- **`docs/requirements.md`** — canonical product requirements.
- **`SESSION_NOTES.md`** — working notes, decisions, and open questions across sessions.

Before touching a refactor item, mark it `[~]` in `docs/refactor.md`.

---

## Backend Conventions

**Stack:** FastAPI · SQLModel · Alembic · PostgreSQL · Python 3.13

**Tooling (matches Zed defaults):**
- Formatter + linter: `ruff` — run via `make format-api` / `make lint-api`
- Type checker: `basedpyright` in `standard` mode (`backend/basedpyrightconfig.json`)
- Tests: `pytest` with `httpx` for router-level integration tests

**Style:**
- Line length: 100 (enforced by ruff format)
- Quote style: double quotes
- Imports: sorted by ruff isort (`known-first-party = ["mampfi_api"]`)
- No `from __future__ import annotations` — use native `X | Y` union syntax (Python 3.13)

**Code rules:**
- No bare `except Exception` — use specific exception types or re-raise with context
- No untyped JSONB: define `TypedDict` or Pydantic models for all `list[dict]` fields
- Membership auth must use the shared `Depends(require_member)` dependency — never inline the session lookup
- No `datetime.utcnow()` — use `now_utc()` from `timeutils.py` (returns timezone-aware datetime)
- All datetimes stored as UTC `timestamptz`; event timezone stored separately as IANA string

**Testing:**
- Tests live in `backend/tests/`
- Use a real test database (no mocking the DB layer)
- Integration tests via `httpx.AsyncClient` against the FastAPI app

---

## Frontend Conventions

**Stack:** React 19 · TypeScript 5 · Vite · TanStack Query · Tailwind CSS · React Router

**Tooling (matches Zed defaults):**
- Language server: `vtsls` (Zed default — no config needed)
- Formatter: `prettier` — run via `make format-web` or `pnpm format`
- Linter: `eslint` (flat config in `eslint.config.ts`) — run via `make lint-web` or `pnpm lint`
- Tests: `vitest` with jsdom — run via `pnpm test`

**Style:**
- Prettier config in `prettier.config.ts`: 100 char width, double quotes, trailing commas, 2-space indent
- No `any` — `@typescript-eslint/no-explicit-any` is set to `error`
- Prefer `unknown` + type narrowing over `any` for API response types

**Component rules:**
- Components over ~300 lines should be split into sub-components or custom hooks
- Tab-level concerns belong in tab-scoped components, not the parent page
- Modal open/close state: use a single reducer or enum-keyed object, not one boolean per modal
- Custom hooks for: shared query context, localStorage preferences, URL param state

**Data fetching:**
- All server state via TanStack Query (`useQuery` / `useMutation`)
- `staleTime` should be set per query — do not leave at `0` for static data (e.g. price items)
- API calls go through `src/lib/api.ts` — add typed response interfaces, no `any` return types

**Testing:**
- Tests live in `frontend/src/__tests__/` or colocated as `*.test.ts(x)`
- Use vitest + jsdom for unit/component tests

---

## Git Conventions

**Branches:** `feat/<slug>`, `fix/<slug>`, `refactor/<slug>`, `chore/<slug>`

**Commits:** imperative mood, present tense — `Add require_member dependency`, not `Added` or `Adding`

**Commit authorship:** don't reference Claude as a co-author

**PRs:** one logical change per PR; reference the relevant `docs/refactor.md` item in the description if applicable.
