# Mampfi

Group ordering made easy. Mampfi lets a group plan daily orders — one member buys, everyone else orders ahead, and the app tracks virtual balances. No external payment processor needed.

## Features

- **Events** with price list, cutoff time, and date range
- **Daily orders** with automatic rollover (server-side, per member)
- **Purchase finalization** with adjustment worksheet, delivery fee, and receipt photos
- **Virtual balances** and payment tracking with dual confirmation
- **Invite system** — group links, single-use links, and email invites
- **Member management** — roles (admin/member), notes (allergies), promotion
- **i18n** — German (default) and English, browser locale detection
- **Email notifications** — verification, password reset, payment alerts, purchase finalization, event deletion
- **Auto-cleanup** — events 90 days past end date are automatically deleted

## Tech Stack

- **Backend**: FastAPI · SQLModel · Alembic · PostgreSQL · Python 3.14
- **Frontend**: React 19 · TypeScript · Vite · TanStack Query · Tailwind CSS
- **Auth**: JWT access tokens + refresh token families with reuse detection
- **Email**: SMTP via transactional outbox pattern (worker)
- **Reverse proxy**: Traefik (auto TLS via Let's Encrypt)
- **CI/CD**: GitHub Actions (lint + test on push, Docker images on tags)

## Repo Layout

```
backend/          FastAPI API + worker
frontend/         React/Vite SPA
infra/            Docker Compose, Traefik, deploy script
docs/             Backlog
assets/           Logo and favicon source files
```

## Development

```bash
# Prerequisites: uv, pnpm, docker

# Start local Postgres
make db-up

# Run API (hot reload)
make dev-api    # → http://localhost:8000 (docs at /docs)

# Run frontend dev server
make dev-web    # → http://localhost:5173

# Apply migrations
make migrate

# Run tests
make test-api   # backend (pytest)
make test-web   # frontend (vitest)

# Format
make format-api # ruff format + check --fix
make format-web # prettier --write
```

Dev auth: in development mode, send `X-Dev-User: you@example.com` header. The frontend provides a quick input when `import.meta.env.DEV` is true.

## Deployment

See [infra/README.md](infra/README.md) for full setup guide.

Quick overview:
1. Traefik handles TLS and routing (`infra/traefik/docker-compose.yml`)
2. Production compose pulls pre-built images from GHCR (`infra/docker-compose.prod.yml`)
3. Deploy script: `./infra/deploy.sh [version]` — pulls, migrates, restarts, health checks

```bash
# Tag a release → GitHub Actions builds images
git tag v1.0.0 && git push --tags

# On server
./infra/deploy.sh v1.0.0
```

## Legal Pages

If you host Mampfi publicly, you are responsible for providing legal documents as required by your jurisdiction. The app serves markdown files from the `legal/` directory at these routes:

| Route | File | Purpose |
|-------|------|---------|
| `/impressum` | `legal/impressum.md` | Legal notice |
| `/privacy` | `legal/privacy.md` | Privacy policy |
| `/terms` | `legal/terms.md` | Terms of use |

Create the files in `legal/` — they are gitignored since they contain operator-specific information. See `legal/README.md` for details.

## API

Swagger UI at `/docs` on the API host. Core resources: events, orders, purchases, payments, invites, balances, members, auth.
