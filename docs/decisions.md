# Implementation decisions

The master plan fixed several technologies. Where this environment could not validate a choice, the
documented fallback was used and the contract kept stable.

| Decision        | Plan                         | Implementation                                                                                         | Reason                                                                                                                                                                                                                    |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth            | Better Auth + Drizzle        | Minimal DB-backed session service in `packages/auth` with the same `getSession`/`requireUser` contract | Better Auth could not be validated against the target Bun/Postgres environment during this build; the Phase 0 plan explicitly allows this fallback. scrypt, cookie flags, expiry, logout, CSRF, and isolation are tested. |
| Queue           | pg-boss                      | Postgres `job_queue` with `FOR UPDATE SKIP LOCKED`, retries, stale-lock recovery, graceful worker exit | Bun/pg-boss spike was not possible here; the Phase 0 plan allows the `SKIP LOCKED` fallback with the same job payload and worker interface.                                                                               |
| ORM             | Drizzle                      | Explicit parameterized SQL in `packages/db/src/store.ts`                                               | Reduces runtime/driver coupling across PGlite and Postgres; the plan permits explicit SQL. Migrations and types are explicit and test-covered.                                                                            |
| DB in dev/tests | Postgres + Docker            | PGlite for local/demo/tests; Postgres in production/compose                                            | Docker daemon is unavailable in this build environment. The SQL is standard Postgres; production uses `postgres-js`.                                                                                                      |
| Next build      | Turbopack default            | `next build --webpack` and `next dev --webpack`                                                        | Turbopack fails on the Bun workspace symlink layout (“Invalid symlink”); webpack builds the same App Router output.                                                                                                       |
| Web dev         | Next dev                     | `next dev --webpack`                                                                                   | Same resolver issue.                                                                                                                                                                                                      |
| AI default      | OpenAI-compatible + fallback | `AI_MODE=template` by default; OpenAI-compatible adapter and automatic fallback included               | No provider key is committed. The template fallback is deterministic and workshop-safe.                                                                                                                                   |
| Demo strategy   | “known-good” demo            | Seeded RSI mean reversion on BTC/IDR 1h, 2025-01-01 → 2025-07-01: +2.82%, 23 trades                    | All templates are long-only and the full 18-month window is a drawdown; the shorter range gives a modest, explainable positive demo. The result is labelled as range-specific and not predictive.                         |
| Market data     | Live Indodax + cache         | Committed snapshot for the workshop; live adapter/cache for production                                 | Live data is verified identical to the snapshot for the demo range. The snapshot avoids network failure during the event.                                                                                                 |
| Browser QA      | sloplint, axe, screenshots   | Static design checks + production build; browser checks documented as pending                          | The host provides no runnable Chromium (Android/musl; bundled binaries fail relocation). Run axe/screenshots on staging before sign-off.                                                                                  |

## Consequences

- The auth and queue fallbacks must be replaced or re-validated if the product moves beyond the
  workshop MVP.
- PGlite is single-process. Do not run the API and worker as separate processes against the same
  PGlite directory; use Postgres for the split topology.
- The web build must keep `--webpack` until the Bun workspace symlink/Turbopack issue is resolved.
- Release gate remains conditional on the pending browser and usability checks.
