#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export DB_DRIVER="${DB_DRIVER:-pglite}"
export PGLITE_PATH="${PGLITE_PATH:-.local/pglite}"
export MARKET_DATA_MODE="${MARKET_DATA_MODE:-fixture}"
export MARKET_DATA_FIXTURE_DIR="${MARKET_DATA_FIXTURE_DIR:-./tests/fixtures/market-data/workshop}"
export AI_MODE="${AI_MODE:-template}"
export WORKER_INLINE="${WORKER_INLINE:-true}"
export PORT="${PORT:-3001}"
export TRUSTED_ORIGINS="${TRUSTED_ORIGINS:-http://localhost:3000}"

mkdir -p .local
bun run scripts/seed.ts

bun run apps/api/src/server.ts &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

bun run --cwd apps/web dev
