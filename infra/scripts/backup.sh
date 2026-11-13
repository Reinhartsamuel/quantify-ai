#!/usr/bin/env bash
set -euo pipefail

# Nightly logical backup for the Quantify Postgres database.
# Run from the repository root, or from cron with an absolute path.
# Requires: docker compose, gzip, sha256sum. Offsite upload is optional.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/quantify-$STAMP.sql.gz"
CHECKSUM="$FILE.sha256"
mkdir -p "$BACKUP_DIR"

echo "[backup] dumping database to $FILE"
docker compose exec -T postgres sh -c \
  'pg_dump --no-owner --no-privileges --clean --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip -9 > "$FILE"

gzip -t "$FILE"
sha256sum "$FILE" > "$CHECKSUM"
SIZE="$(du -h "$FILE" | cut -f1)"
echo "[backup] wrote $FILE ($SIZE)"
echo "[backup] checksum: $(cat "$CHECKSUM")"

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  command -v aws >/dev/null || { echo "[backup] aws CLI not found" >&2; exit 1; }
  aws s3 cp "$FILE" "s3://$BACKUP_S3_BUCKET/quantify/$STAMP.sql.gz" --only-show-errors
  aws s3 cp "$CHECKSUM" "s3://$BACKUP_S3_BUCKET/quantify/$STAMP.sql.gz.sha256" --only-show-errors
  echo "[backup] uploaded to s3://$BACKUP_S3_BUCKET/quantify/"
fi

if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null || { echo "[backup] rclone not found" >&2; exit 1; }
  rclone copy "$FILE" "$BACKUP_RCLONE_REMOTE" --checksum
  rclone copy "$CHECKSUM" "$BACKUP_RCLONE_REMOTE" --checksum
  echo "[backup] uploaded with rclone to $BACKUP_RCLONE_REMOTE"
fi

echo "[backup] pruning local backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name 'quantify-*.sql.gz*' -type f -mtime "+$RETENTION_DAYS" -delete

echo "[backup] done"
