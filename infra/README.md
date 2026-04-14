# Infrastructure

## Architecture

```
Internet → Traefik (ports 80/443, auto TLS)
             ├── mampfi.zenbytes.eu /v1/*, /docs*, /health → mampfi-api:8000
             ├── mampfi.zenbytes.eu /*                      → mampfi-web:8080
```

## First-time server setup

```bash
# 1. Install Docker (if not already)
# https://docs.docker.com/engine/install/ubuntu/

# 2. Start Traefik
docker compose -f infra/traefik/docker-compose.yml up -d

# 3. Create .env
cp infra/.env.example infra/.env
# Edit infra/.env with real values (DB password, SECRET_KEY, SMTP, etc.)

# 4. Deploy Mampfi
./infra/deploy.sh
```

## Deploying updates

```bash
# Tag a release locally
git tag v0.1.0 && git push --tags
# GitHub Actions builds + pushes images to GHCR

# On server
./infra/deploy.sh v0.1.0    # deploy specific version
./infra/deploy.sh            # deploy latest
```

## Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local dev — builds from source, exposes ports directly |
| `docker-compose.prod.yml` | Production — pulls GHCR images, Traefik labels |
| `traefik/docker-compose.yml` | Traefik reverse proxy (shared across all stacks) |
| `deploy.sh` | Pull images, run migrations, restart, health check |
| `.env.example` | Template for production environment variables |
