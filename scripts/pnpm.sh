#!/usr/bin/env bash
# Project pnpm entrypoint. Bare `pnpm` may be hijacked by corepack
# because ~/package.json declares yarn — always prefer this wrapper.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -x ./node_modules/.bin/pnpm ]]; then
  exec ./node_modules/.bin/pnpm "$@"
fi

exec npx --yes pnpm@9.15.0 "$@"
