#!/usr/bin/env bash
# Run any command with APP_ENV=local|dev|prod.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Keep Prisma/engine caches inside the workspace (sandbox-friendly)
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$ROOT/.cache}"
export PRISMA_CACHE_DIR="${PRISMA_CACHE_DIR:-$ROOT/.cache/prisma}"

ENV_NAME="${1:-}"
shift || true

if [[ -z "${ENV_NAME}" || -z "${1:-}" ]]; then
  echo "Usage: ./scripts/with-env.sh <local|dev|prod> <command...>"
  echo "Examples:"
  echo "  ./scripts/with-env.sh local ./scripts/pnpm.sh db:seed"
  echo "  ./scripts/with-env.sh prod ./scripts/pnpm.sh --filter @wayrune/api start"
  exit 1
fi

case "$ENV_NAME" in
  local|dev|prod) ;;
  *)
    echo "APP_ENV must be local, dev, or prod (got: $ENV_NAME)"
    exit 1
    ;;
esac

ENV_FILE="$ROOT/envs/${ENV_NAME}.env"
if [[ ! -f "$ENV_FILE" ]]; then
  EXAMPLE="$ROOT/envs/${ENV_NAME}.env.example"
  echo "Missing $ENV_FILE"
  if [[ -f "$EXAMPLE" ]]; then
    echo "Copy the example first: cp $EXAMPLE $ENV_FILE"
  fi
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export APP_ENV="$ENV_NAME"

exec "$@"
