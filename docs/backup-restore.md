# Backup and restore

## Objectives

- **RPO:** 24 hours for the workshop MVP (nightly logical backup; take an extra backup before any
  migration or release).
- **RTO:** 60 minutes on the workshop VPS (restore into a new database, verify, switch).
- **Retention:** 14 days local, 30 days offsite recommended. The committed market-data snapshot is
  separate and versioned with the code.

## Nightly backup

Run from the repository root on the server:

```bash
BACKUP_DIR=/srv/quantify/backups BACKUP_RETENTION_DAYS=14 ./infra/scripts/backup.sh
```

The script:

1. `pg_dump --clean --if-exists --no-owner --no-privileges` through `docker compose exec`;
2. gzip and `gzip -t` verification;
3. SHA-256 sidecar;
4. optional `aws s3 cp` (`BACKUP_S3_BUCKET`) or `rclone copy` (`BACKUP_RCLONE_REMOTE`);
5. deletes local backups older than the retention window.

Cron example:

```cron
15 2 * * * cd /srv/quantify && BACKUP_DIR=/srv/quantify/backups BACKUP_S3_BUCKET=my-bucket ./infra/scripts/backup.sh >> /var/log/quantify-backup.log 2>&1
```

Do not store only on the same disk. Copy offsite or to a second volume, and restrict access because
the dump contains password hashes and private strategy data.

## Restore drill (required before release)

```bash
./infra/scripts/restore.sh backups/quantify-20261113T021500Z.sql.gz
```

This restores into a new database (`quantify_restore_<timestamp>`), verifies the checksum, runs
counts for users, strategies, versions, backtests, completed backtests, candles, and share links.
The live database is untouched. Record the output in the release evidence.

Promotion is deliberately manual and refused by the script:

1. Take a fresh backup of the live database.
2. Stop API and worker: `docker compose stop api worker`.
3. Rename databases in Postgres (`ALTER DATABASE ... RENAME TO ...`), or point `DATABASE_URL` at
   the verified restore.
4. Start API and worker; check `/api/ready`, log in, run one backtest, and confirm a share link.
5. Keep the old database until the workshop ends.

## What is not backed up

- Caddy certificates (automatic; can be re-issued).
- Container images (rebuild from the release tag).
- `.env` secrets (store in a password manager; do not put them in the database backup).
- Market-data snapshot files (committed in the repo; also keep a copy on the facilitator laptop).

## Verification checklist

- [ ] `gzip -t` passes.
- [ ] SHA-256 matches the sidecar.
- [ ] Restore into a new database succeeds with `ON_ERROR_STOP=1`.
- [ ] Counts are plausible (users > 0, completed backtests > 0, candles > 0 for both symbols).
- [ ] Sign-in works against a restored copy (staging).
- [ ] A known backtest is readable and its output hash matches.
- [ ] Backup file permissions are restricted (`chmod 600`).
- [ ] Offsite copy exists and was downloaded once to confirm integrity.
