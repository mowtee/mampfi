#!/usr/bin/env bash
set -euo pipefail

# Mampfi deploy script (Docker Compose)
# Builds images, runs DB migrations, and restarts services.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

REF=""
NO_PULL=false
NO_BUILD=false
SKIP_MIGRATE=false
WITH_WORKER=false
COMPOSE_CMD=""

# Remote deploy options (rsync + remote compose)
REMOTE=""
REMOTE_PATH=""
SSH_PORT=22
NO_RSYNC=false
RSYNC_OPTS="-avz"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --ref <git-ref>      Checkout a specific ref before updating (branch/tag/SHA)
  --no-pull            Do not pull latest changes (use current working tree)
  --no-build           Skip image builds (re-use existing images)
  --skip-migrate       Skip running Alembic migrations
  --with-worker        Also build/restart the worker service
  --compose <cmd>      Compose command to use (e.g. "docker compose" or "docker-compose")
  --remote <user@host> Deploy to remote host via rsync + SSH
  --remote-path <dir>  Absolute path on remote host (e.g. /home/user/mampfi)
  --ssh-port <port>    SSH port for remote host (default: 22)
  --no-rsync           Skip rsync step (assumes code already on remote)
  --rsync-opts <opts>  Extra rsync options (default: "-avz")
  -h, --help           Show this help

Examples:
  $0                          # pull, build api+web, migrate, restart api+web
  $0 --with-worker            # same as above plus worker
  $0 --ref main               # checkout main first
  $0 --no-build --skip-migrate
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --no-pull) NO_PULL=true; shift ;;
    --no-build) NO_BUILD=true; shift ;;
    --skip-migrate) SKIP_MIGRATE=true; shift ;;
    --with-worker) WITH_WORKER=true; shift ;;
    --compose) COMPOSE_CMD="$2"; shift 2 ;;
    --remote) REMOTE="$2"; shift 2 ;;
    --remote-path) REMOTE_PATH="$2"; shift 2 ;;
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    --no-rsync) NO_RSYNC=true; shift ;;
    --rsync-opts) RSYNC_OPTS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

# If deploying to a remote host
if [[ -n "${REMOTE}" ]]; then
  if [[ -z "${REMOTE_PATH}" ]]; then
    echo "ERROR: --remote-path is required when using --remote" >&2
    exit 1
  fi
  echo "Remote deploy to ${REMOTE}:${REMOTE_PATH} (SSH port ${SSH_PORT})"

  # Optionally checkout/pull locally before syncing
  cd "${REPO_DIR}"
  if [[ -n "${REF}" ]]; then
    echo "Checking out ref locally: ${REF}"
    git fetch --all --tags
    git checkout "${REF}"
  fi
  if [[ "${NO_PULL}" != true ]]; then
    echo "Pulling latest changes locally..."
    git pull --ff-only
  else
    echo "Skipping git pull (per --no-pull)"
  fi

  # Ensure remote path exists
  ssh -p "${SSH_PORT}" "${REMOTE}" "mkdir -p '${REMOTE_PATH}'"

  # Rsync working tree to remote
  if [[ "${NO_RSYNC}" != true ]]; then
    EXCLUDE_FILE="${REPO_DIR}/deploy.rsync-exclude"
    if [[ -f "${EXCLUDE_FILE}" ]]; then
      echo "Rsync to remote with exclude file: ${EXCLUDE_FILE}"
      rsync ${RSYNC_OPTS} --delete --exclude-from="${EXCLUDE_FILE}" -e "ssh -p ${SSH_PORT}" "${REPO_DIR}/" "${REMOTE}:${REMOTE_PATH}"
    else
      echo "Rsync to remote (no exclude file found)"
      rsync ${RSYNC_OPTS} --delete -e "ssh -p ${SSH_PORT}" "${REPO_DIR}/" "${REMOTE}:${REMOTE_PATH}"
    fi
  else
    echo "Skipping rsync (per --no-rsync)"
  fi

  # Build, migrate, and restart on remote
  REMOTE_SH=$(cat <<'EOSH'
set -euo pipefail
COMPOSE_FILE="infra/docker-compose.yml"

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  else
    echo ""; return 1
  fi
}

COMPOSE_CMD=$(detect_compose)
if [[ -z "$COMPOSE_CMD" ]]; then
  echo "ERROR: Docker Compose not found on remote host" >&2
  exit 1
fi

echo "Using compose: $COMPOSE_CMD"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "ERROR: Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

# Ensure external caddy network exists
if ! docker network ls --format '{{.Name}}' | grep -qx 'caddy_network'; then
  echo "Creating external network 'caddy_network'"
  docker network create caddy_network >/dev/null
fi

SERVICES=(api web)
WITH_WORKER_PLACEHOLDER

if [[ "NO_BUILD_PLACEHOLDER" != "true" ]]; then
  echo "Building images: ${SERVICES[*]}"
  $COMPOSE_CMD -f "$COMPOSE_FILE" build "${SERVICES[@]}"
else
  echo "Skipping build (per --no-build)"
fi

if [[ "SKIP_MIGRATE_PLACEHOLDER" != "true" ]]; then
  echo "Running DB migrations..."
  $COMPOSE_CMD -f "$COMPOSE_FILE" --profile migrate run --rm migrate
else
  echo "Skipping migrations (per --skip-migrate)"
fi

echo "Restarting services: ${SERVICES[*]}"
$COMPOSE_CMD -f "$COMPOSE_FILE" up -d --no-deps --force-recreate "${SERVICES[@]}"

echo "Services status:"
$COMPOSE_CMD -f "$COMPOSE_FILE" ps

echo "Recent API logs:"
$COMPOSE_CMD -f "$COMPOSE_FILE" logs --no-color --tail=100 api || true
EOSH
)

  # Inject flags into the remote script
  if [[ "${WITH_WORKER}" == true ]]; then
    REMOTE_SH="${REMOTE_SH/WITH_WORKER_PLACEHOLDER/SERVICES+=(worker)}"
  else
    REMOTE_SH="${REMOTE_SH/WITH_WORKER_PLACEHOLDER/:}"
  fi
  if [[ "${NO_BUILD}" == true ]]; then
    REMOTE_SH="${REMOTE_SH/NO_BUILD_PLACEHOLDER/true}"
  else
    REMOTE_SH="${REMOTE_SH/NO_BUILD_PLACEHOLDER/false}"
  fi
  if [[ "${SKIP_MIGRATE}" == true ]]; then
    REMOTE_SH="${REMOTE_SH/SKIP_MIGRATE_PLACEHOLDER/true}"
  else
    REMOTE_SH="${REMOTE_SH/SKIP_MIGRATE_PLACEHOLDER/false}"
  fi

  echo "Executing remote deployment commands..."
  ssh -p "${SSH_PORT}" "${REMOTE}" "cd '${REMOTE_PATH}' && bash -s" <<< "${REMOTE_SH}"

  echo "Done (remote)."
  exit 0
fi

# Local deploy path (no --remote)
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found in PATH" >&2
  exit 1
fi
if [[ -z "${COMPOSE_CMD}" ]]; then
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  else
    echo "ERROR: Docker Compose not found (tried 'docker compose' and 'docker-compose')" >&2
    exit 1
  fi
fi
echo "Using compose: ${COMPOSE_CMD}"

cd "${REPO_DIR}"
if [[ -n "${REF}" ]]; then
  echo "Checking out ref: ${REF}"
  git fetch --all --tags
  git checkout "${REF}"
fi
if [[ "${NO_PULL}" != true ]]; then
  echo "Pulling latest changes..."
  git pull --ff-only
else
  echo "Skipping git pull (per --no-pull)"
fi
if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "ERROR: Compose file not found at ${COMPOSE_FILE}" >&2
  exit 1
fi
if [[ ! -f "${SCRIPT_DIR}/.env" ]]; then
  echo "NOTE: ${SCRIPT_DIR}/.env not found; services will use defaults or environment." >&2
else
  echo "Using env file: ${SCRIPT_DIR}/.env"
fi
if ! docker network ls --format '{{.Name}}' | grep -qx 'caddy_network'; then
  echo "Creating external network 'caddy_network' (if used by your proxy)"
  docker network create caddy_network >/dev/null
fi
SERVICES=(api web)
if [[ "${WITH_WORKER}" == true ]]; then
  SERVICES+=(worker)
fi
if [[ "${NO_BUILD}" != true ]]; then
  echo "Building images: ${SERVICES[*]}"
  eval ${COMPOSE_CMD} -f "${COMPOSE_FILE}" build "${SERVICES[@]}"
else
  echo "Skipping build (per --no-build)"
fi
if [[ "${SKIP_MIGRATE}" != true ]]; then
  echo "Running DB migrations..."
  eval ${COMPOSE_CMD} -f "${COMPOSE_FILE}" --profile migrate run --rm migrate
else
  echo "Skipping migrations (per --skip-migrate)"
fi
echo "Restarting services: ${SERVICES[*]}"
eval ${COMPOSE_CMD} -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate "${SERVICES[@]}"
echo "Services status:"
eval ${COMPOSE_CMD} -f "${COMPOSE_FILE}" ps
echo "Recent API logs:"
eval ${COMPOSE_CMD} -f "${COMPOSE_FILE}" logs --no-color --tail=100 api || true
echo "Done."
