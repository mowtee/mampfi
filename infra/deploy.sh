#!/usr/bin/env bash
set -euo pipefail

# Mampfi deploy script — pulls pre-built images from GHCR and restarts.
#
# Usage:
#   ./deploy.sh                 # deploy latest
#   ./deploy.sh v0.1.0          # deploy a specific version
#   ./deploy.sh --skip-migrate  # skip DB migrations

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env"

TAG="${1:-latest}"
SKIP_MIGRATE=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --skip-migrate) SKIP_MIGRATE=true ;;
    --help|-h)
      echo "Usage: $(basename "$0") [TAG] [--skip-migrate]"
      echo "  TAG: image tag to deploy (default: latest)"
      exit 0 ;;
    v*) TAG="$arg" ;;
  esac
done

export TAG

echo "=== Mampfi deploy (tag: ${TAG}) ==="

# Preflight checks
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Copy from .env.example and fill in values." >&2
  exit 1
fi

if ! docker network ls --format '{{.Name}}' | grep -qx 'traefik'; then
  echo "ERROR: 'traefik' network not found. Start Traefik first:" >&2
  echo "  docker compose -f infra/traefik/docker-compose.yml up -d" >&2
  exit 1
fi

# Pull latest images
echo "Pulling images..."
docker compose -f "${COMPOSE_FILE}" pull api web

# Run migrations
if [[ "${SKIP_MIGRATE}" != true ]]; then
  echo "Running migrations..."
  docker compose -f "${COMPOSE_FILE}" --profile migrate run --rm migrate
else
  echo "Skipping migrations (--skip-migrate)"
fi

# Restart services
echo "Restarting services..."
docker compose -f "${COMPOSE_FILE}" --profile prod up -d

# Health check
echo "Waiting for API health..."
for i in $(seq 1 30); do
  if docker compose -f "${COMPOSE_FILE}" exec -T api curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo "API healthy."
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "WARNING: API health check timed out after 30s"
    docker compose -f "${COMPOSE_FILE}" logs --tail=50 api
    exit 1
  fi
  sleep 1
done

echo ""
echo "=== Deploy complete ==="
docker compose -f "${COMPOSE_FILE}" --profile prod ps
