# Mampfi

Group ordering made easy. Mampfi lets a group plan daily orders, one member buys the group order, and the app tracks balances virtually — no external payments.

## What It Does
- Events with fixed price list and daily cutoff
- Daily orders (optional rollover per member)
- Group Order view and buyer finalization (with adjustments and per-member allocations)
- Virtual balances, payments with confirmation
- Invite links to join events

UI details:
- Status badge shows "Open until HH:MM" or "Locked" (no timezone text)
- Dates formatted using the browser locale

## Tech
- Backend: FastAPI, SQLModel, Alembic, PostgreSQL
- Frontend: React + TypeScript + Vite
- State/Forms: TanStack Query, react-hook-form + zod
- Styling: Tailwind-like custom CSS + small components
- Emails: SMTP (outbound only)
- Reverse proxy: Caddy (external)

## Repo Layout
- `backend/` FastAPI app (Poetry, Alembic)
- `frontend/` React SPA (Vite)
- `infra/` Docker Compose, example Caddyfile
- `scripts/` Helper scripts
- `SESSION_NOTES.md` Project log and decisions

## Development

1) Configure environment
   - `cp backend/.env.example backend/.env` and edit (DB URL, SMTP, etc.)
2) Start Postgres
   - `make db-up` (or use Docker Compose `db` service)
3) Migrate DB
   - `make migrate`
4) Run services
   - API: `make dev-api` → http://localhost:8000 (docs at /docs)
   - Web: `make dev-web` → http://localhost:5173

Dev auth: send `X-Dev-User: you@example.com` to the API (frontend provides a quick input). Replace with real auth later.

## Deployment

Use Docker Compose for API, Web, and DB, and run Caddy separately to terminate TLS and reverse proxy.

1) Prepare env (single file)
   - Copy `infra/.env.example` to `infra/.env` and edit
   - Define both DB service credentials (POSTGRES_*) and app settings (e.g., DATABASE_URL, MAIL_FROM, SMTP_*) in this file
2) Create external Caddy network (shared between stacks)
   - `docker network create caddy_network`
3) Build and start (no host ports; Caddy will reach services on the docker network)
   - `docker compose -f infra/docker-compose.yml up -d --build db api web`
4) Run migrations
   - `docker compose -f infra/docker-compose.yml --profile migrate run --rm migrate`
5) Put Caddy in front (examples in `infra/Caddyfile.example`)
   - Ensure your Caddy container/service also joins `caddy_network`
   - Single-domain path routing (recommended):
     - `/v1/*` (preserve prefix) and `/docs*` → `api:8000`
     - everything else → `web:80`
   - Two-subdomain setup (optional): `api.yourdomain` → `api:8000`, `app.yourdomain` → `web:80`

Notes:
- No host ports are required in production when using an external proxy. The Compose file attaches
  `api` and `web` to the external `caddy_network` so Caddy can reach them by service name.
- For single-domain path routing, build the frontend with `VITE_API_URL=` (empty) so it calls `/v1/...` on the same origin. Our Compose passes `VITE_API_URL` from `infra/.env` into the frontend build.
- Data persists in the `pgdata` volume.
- Optional `worker` service can be enabled for notifications/scheduling.

## API

Swagger UI at `/docs` on the API host. Core resources: events, orders, purchases, payments, invites, balances, members.

For ongoing design and decisions, see `SESSION_NOTES.md` and `mampfi_requirements.md`.
