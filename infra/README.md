# Infrastructure

## Architecture

```
Internet → Traefik (ports 80/443, auto TLS)
             ├── mampfi.zenbytes.eu /v1/*, /docs*, /health → mampfi-api:8000
             ├── mampfi.zenbytes.eu /*                      → mampfi-web:8080
             ├── docs.zenbytes.eu                           → (your docs service)
             └── files.zenbytes.eu                          → (your files service)
```

All compose stacks share the `traefik` Docker network. Routing is declared via container labels — no central config to update.

## First-time server setup

```bash
# 1. Install Docker (if not already)
# https://docs.docker.com/engine/install/ubuntu/

# 2. Login to GHCR (one-time)
echo $PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# 3. Start Traefik
docker compose -f infra/traefik/docker-compose.yml up -d

# 4. Create .env
cp infra/.env.example infra/.env
# Edit infra/.env with real values (DB password, SECRET_KEY, SMTP, etc.)

# 5. Deploy Mampfi
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

## Migrating existing services to Traefik

Add these labels to your existing `docs.zenbytes.eu` and `files.zenbytes.eu` services:

```yaml
services:
  your-service:
    # ... existing config ...
    networks:
      - default
      - traefik
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.SERVICENAME.rule=Host(`DOMAIN.zenbytes.eu`)"
      - "traefik.http.routers.SERVICENAME.entrypoints=websecure"
      - "traefik.http.routers.SERVICENAME.tls.certresolver=letsencrypt"
      - "traefik.http.services.SERVICENAME.loadbalancer.server.port=PORT"

networks:
  traefik:
    external: true
```

Then remove Caddy and the `caddy_network`.
