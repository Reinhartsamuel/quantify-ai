# Deployment

## Local demo (no Docker, no Postgres server)

Requirements: Bun 1.4+, Node 20.9+ (Next build), and the committed workshop snapshot.

```bash
cd quantify
bun install
cp .env.example .env
# Edit SESSION_SECRET; keep AI_MODE=template, MARKET_DATA_MODE=fixture.
mkdir -p .local
DB_DRIVER=pglite PGLITE_PATH=.local/pglite MARKET_DATA_MODE=fixture \
  AI_MODE=template WORKER_INLINE=true bun run db:seed
```

Run the API and web in separate terminals:

```bash
# Terminal 1
DB_DRIVER=pglite PGLITE_PATH=.local/pglite MARKET_DATA_MODE=fixture \
  MARKET_DATA_FIXTURE_DIR=./tests/fixtures/market-data/workshop \
  AI_MODE=template WORKER_INLINE=true PORT=3001 bun run apps/api/src/server.ts

# Terminal 2
bun run --cwd apps/web dev
```

Open `http://localhost:3000`. The web dev server currently needs the explicit `--webpack` flag for
environment compatibility; the build script already includes it. Next 16’s Turbopack resolver fails
on this Bun symlink layout with “Invalid symlink”; webpack is the supported path for this repo.

Demo credentials (change before an event): `demo@quantify.local` / `workshop-demo-2026`.
The seeded RSI demo over 2025-01-01 → 2025-07-01 returns +2.82% with 23 trades on the committed
snapshot. Do not present this as expected future return.

## Production topology

```
Internet :443 → Caddy (TLS, headers)
                 ├── /api/*  → API (Hono) :3001
                 └── /*      → Web (Next) :3000
API / Worker → Postgres 16 (internal network, no published port)
```

Only Caddy publishes ports. Postgres, API, and web are on an internal bridge network. The worker
has no inbound port.

### 1. Prerequisites

- Linux VPS/EC2, 2 vCPU / 4 GB RAM / 20 GB disk (workshop headroom; scale to 4 vCPU if the live AI
  provider is used heavily).
- Docker Engine + Compose v2.
- A DNS A/AAAA record for the chosen domain.
- Ports 80 and 443 open. 80 is used for ACME and redirects.

### 2. Environment

Copy `.env.example` to `.env` on the server. Minimum changes:

```dotenv
APP_ENV=production
NODE_ENV=production
APP_URL=https://your-domain.example
API_URL=https://your-domain.example
DOMAIN=your-domain.example
POSTGRES_PASSWORD=<long-random>
SESSION_SECRET=<32+ random characters>
TRUSTED_ORIGINS=https://your-domain.example
COOKIE_SECURE=true
MARKET_DATA_MODE=fixture
MARKET_DATA_FIXTURE_DIR=/app/tests/fixtures/market-data/workshop
AI_MODE=template            # or openai-compatible with AI_BASE_URL/KEY/MODEL
WORKER_CONCURRENCY=2
RATE_LIMIT_ENABLED=true
```

Generate secrets with `openssl rand -hex 32`. Never commit `.env`. The web build uses a relative
API URL inside compose (`NEXT_PUBLIC_API_URL=""`) so browser requests go through Caddy and do not
need cross-origin CORS.

### 3. Build and start

```bash
docker compose build --pull
docker compose up -d postgres
docker compose run --rm api bun run scripts/migrate.ts   # optional; API also migrates on boot
docker compose up -d api worker web caddy
docker compose ps
```

The API and worker run migrations on startup (`Store.migrate()`); running the one-off command is a
belt-and-braces check. Seed the demo once:

```bash
docker compose run --rm api bun run scripts/seed.ts
```

Set `DEMO_PASSWORD` and `DEMO_SHARE_TOKEN` to event-specific values in the run environment.

### 4. Verify

```bash
curl -fsS https://your-domain.example/api/health
curl -fsS https://your-domain.example/api/ready
curl -fsS https://your-domain.example/api/health/market-data
curl -fsS https://your-domain.example/api/health/queue
docker compose logs --tail=100 api worker caddy
```

`/api/health/market-data` must show all four series with `workshopRangeCovered: true`. Complete one
backtest as the demo user and open the share link in a private window.

### 5. Operations

- Logs: JSON to stdout; ship with the platform or `docker compose logs`.
- Queue: `/api/health/queue`; alert if depth > 100 or failed > 0.
- Restart policy: `unless-stopped`.
- Worker shutdown: finishes in-flight jobs for up to 30 seconds, then exits.
- Stale jobs: requeued after 5 minutes; backtests can be re-claimed.
- Scaling: worker concurrency 2 by default. Do not exceed one running backtest per user; API
  enforces it at submission.
- Rotate `SESSION_SECRET` only with a planned sign-out of all users (sessions are DB-backed; the
  secret is reserved for future signed tokens and is not currently mixed into session hashes).

### 6. Upgrade

```bash
./infra/scripts/backup.sh
docker compose build --pull
docker compose up -d api worker web caddy
curl -fsS https://your-domain.example/api/ready
```

Migrations are additive/idempotent in `001_init.sql`. For destructive future migrations, take a
backup and rehearse on staging first.

### 7. Rollback

```bash
docker compose down
# Restore the previous images from your registry tag (or rebuild the previous git tag), then:
docker compose up -d
```

If a migration must be undone, restore the pre-upgrade backup into a new database, verify, stop API
and worker, rename databases, and restart. See `docs/backup-restore.md`.

### 8. Log retention and privacy

Request logs contain method, path, status, duration, and request ID only. They do not contain
cookies, prompts, passwords, or response bodies. Generation audit stores a prompt hash, provider,
model, status, latency, and token counts. Strategies store the source prompt the user chose to
save, for traceability; document retention with BlockDev.id.
