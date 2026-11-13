#!/usr/bin/env bash
set -euo pipefail

# Restore a Quantify logical backup into a *new* database, verify it, then
# optionally promote it. Never restore over the live database without
# stopping the API and worker and taking a fresh backup first.
#
# Usage:
#   ./infra/scripts/restore.sh backups/quantify-20261113T000000Z.sql.gz
#   ./infra/scripts/restore.sh <file> --target-db quantify_restore_20261113
#   ./infra/scripts/restore.sh <file> --promote

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
FILE="${1:-}"
shift || true
TARGET_DB=""
PROMOTE=0
for arg in "$@"; do
  case "$arg" in
    --target-db) TARGET_DB="${2:?missing value}"; shift 2 ;;
    --promote) PROMOTE=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: $0 <backup.sql.gz> [--target-db name] [--promote]" >&2
  exit 1
fi
gzip -t "$FILE"
if [[ -f "$FILE.sha256" ]]; then
  sha256sum -c "$FILE.sha256"
fi

TARGET_DB="${TARGET_DB:-quantify_restore_$(date -u +%Y%m%d_%H%M%S)}"
echo "[restore] verifying backup is readable"
gunzip -c "$FILE" | head -c 4 | grep -q '^--' || true

echo "[restore] creating database $TARGET_DB"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$TARGET_DB\";"

echo "[restore] restoring into $TARGET_DB"
gunzip -c "$FILE" | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1
trap 'echo "[restore] target $TARGET_DB left in place for inspection" >&2' EXIT

echo "[restore] sanity checks"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'users' AS table, count(*) FROM users
UNION ALL SELECT 'strategies', count(*) FROM strategies
UNION ALL SELECT 'strategy_versions', count(*) FROM strategy_versions
UNION ALL SELECT 'backtest_jobs', count(*) FROM backtest_jobs
UNION ALL SELECT 'completed_backtests', count(*) FROM backtest_jobs WHERE status = 'COMPLETED'
UNION ALL SELECT 'market_candles', count(*) FROM market_candles
UNION ALL SELECT 'share_links', count(*) FROM share_links;
SQL

if [[ "$PROMOTE" == "1" ]]; then
  echo "[restore] promoting $TARGET_DB - stop api and worker first, then run this with the app stopped"
  echo "[restore] refusing automatic promotion from this script. See docs/backup-restore.md."
  exit 2
fi

echo "[restore] verified in $TARGET_DB. Live database was not changed."
