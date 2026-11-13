# Quantify — AI Trading Strategy Lab

A workshop-first product that turns a natural-language crypto trading idea into a strict,
editable strategy specification and runs a deterministic long-only spot backtest against Indodax
historical candles.

**Simulation only.** No exchange keys, live orders, custody, leverage, or shorting. Not investment
advice. Past performance does not predict future results.

## What works

- Email/password accounts with DB-backed sessions, CSRF protection, ownership checks, and rate limits.
- Natural-language generation with an OpenAI-compatible provider and a deterministic template
  fallback (EMA, SMA, RSI, Bollinger).
- StrategySpec v1 with strict Zod schema, semantic validation, and plain-language rendering.
- Immutable strategy versions, version comparison, archive, templates.
- Deterministic backtest engine: next-candle-open fills, fees, slippage, stop/take with stop-first
  intrabar policy, end-of-data close, output hash.
- Asynchronous queue/worker (Postgres `SKIP LOCKED`), retries, stale-lock recovery, safe errors.
- Results dashboard: summary metrics, equity/drawdown charts with table fallback, trades, CSV,
  assumptions, data manifest, warnings, disclosure, expiring read-only share links.
- Workshop hardening: committed Indodax snapshot with SHA-256 manifest, coverage health, fixture
  mode, AI acceptance set and fallback drills, load test, Docker/Caddy deployment, backups, runbooks.

## Architecture

```text
apps/web            Next.js 16 App Router UI (TypeScript, Tailwind v4, lightweight-charts)
apps/api            Hono API (Node/Bun), sessions, rate limits, backtests, shares
apps/worker         PG queue worker (backtest.run)
packages/config     constraints, symbols, limits, environment
packages/contracts  API request/response schemas and DTOs
packages/strategy-spec  Zod v1 schema, semantic validation, renderer, templates, JSON schema
packages/indicators     EMA, SMA, RSI, Bollinger, crosses (pure functions)
packages/strategy-compiler  spec + candles → executable plan
packages/backtest-engine    deterministic simulation, hashes, trades, equity
packages/performance        metric definitions
packages/market-data        Indodax adapter, validation, manifests, fixture provider, cache
packages/ai                 provider contract, OpenAI-compatible adapter, template fallback
packages/db                 SQL migrations, store, queue, PGlite/Postgres clients
packages/auth               scrypt passwords, sessions, CSRF cookies
packages/backtest-runner    job orchestration shared by API (inline) and worker
scripts                     seed, prefetch/verify data, AI acceptance, load/failure drills
tests                       integration tests (PGlite + Hono)
infra                       Dockerfiles, compose, Caddy, backup/restore
docs                        coverage, security, deployment, runbooks, release gate, evidence
```

## Quick start

```bash
bun install
cp .env.example .env
mkdir -p .local
DB_DRIVER=pglite PGLITE_PATH=.local/pglite MARKET_DATA_MODE=fixture \
  AI_MODE=template WORKER_INLINE=true bun run db:seed

# Terminal 1
DB_DRIVER=pglite PGLITE_PATH=.local/pglite MARKET_DATA_MODE=fixture \
  MARKET_DATA_FIXTURE_DIR=./tests/fixtures/market-data/workshop \
  AI_MODE=template WORKER_INLINE=true PORT=3001 bun run apps/api/src/server.ts

# Terminal 2
bun run --cwd apps/web dev
```

Open http://localhost:3000. Demo: `demo@quantify.local` / `workshop-demo-2026` (change before an
event).

Or use Docker Compose; see `docs/deployment.md`.

## Commands

```bash
bun run test                  # Vitest: packages + API integration
bun run typecheck             # TypeScript across all workspaces
bun run build                 # typecheck + production web build
bun run db:migrate            # apply the schema
bun run db:seed               # demo user, templates, known-good backtest, share link
bun run data:prefetch         # refresh the Indodax workshop snapshot (network)
bun run data:verify           # verify counts, timestamps, gaps, hashes
bun run scripts/demo-fixture.ts --live   # fixture vs live demo equivalence
bun run ai:preflight          # provider/config checks (add -- --probe)
bun run ai:acceptance         # 15-prompt contract set; writes evidence
bun run load:test             # 45-user capacity run; writes evidence
bun run scripts/failure-drill.ts # 429/5xx/timeout/retry/stale-lock drills
```

`bun run build` uses webpack for Next (Turbopack currently fails on this Bun symlink layout with
“Invalid symlink”). The Next build output is verified.

## Current evidence

- `docs/evidence/demo-fixture.json` — fixture vs live candles/output identical; demo +2.82%, 23 trades.
- `docs/evidence/ai-acceptance.json` — 100% valid specs on 10 supported prompts; all statuses matched.
- `docs/evidence/load-test.json` — 45 users, 270 requests, 0 failures; backtest p95 17.5 s.
- `docs/evidence/failure-drill.json` — 429/5xx/timeout fallback, retry-after-transient, stale worker
  lock recovery, queue max attempts.
- `docs/evidence/design-check.json` — semantic tokens, tabular numerals, focus, reduced motion,
  mobile breakpoints, no fake social proof.

## Documentation

- [Workshop runbook](docs/workshop.md) · [Panduan Bahasa Indonesia](docs/workshop-id.md) · [Participant handout](docs/participant-handout.md)
- [StrategySpec v1](docs/strategy-spec-v1.md) · [Indodax coverage](docs/indodax-coverage.md)
- [Security review](docs/security-review.md) · [Data reliability](docs/data-reliability.md) ·
  [AI reliability](docs/ai-reliability.md)
- [Deployment](docs/deployment.md) · [Backup/restore](docs/backup-restore.md) ·
  [Load test](docs/load-test.md) · [Failure drills](docs/failure-drill.md)
- [Release gate](docs/release-gate.md) · [Usability rehearsal](docs/usability-rehearsal.md) ·
  [Post-workshop](docs/post-workshop.md) · [Decisions](docs/decisions.md)

## Limitations

- BTC/IDR and ETH/IDR, 1h/4h, long-only spot only; one open position.
- A single in-sample backtest is not evidence of future performance.
- The deployed workshop should use fixture mode for predictable data and template AI fallback.
- Browser-based visual/axe checks and the non-technical usability rehearsal are pending on staging;
  see the release gate.
