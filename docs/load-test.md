# Load test

## Profile

- 45 simulated workshop users, concurrency 10.
- Each user: sign up → create strategy → save version → generate rules (template) → submit one
  backtest → read result → list strategies.
- Backtest range: 2025-01-01 → 2025-07-01 UTC, 1h, 4,344 candles, 20 bps fee, 5 bps slippage.
- In-process Hono app + PGlite + fixture data. This measures application, engine, and database work
  without TLS/network overhead. Rate limits are disabled for the capacity run; they are covered by
  integration tests.
- Worker concurrency 2; one running backtest per user at submission; polling interval 1.5 s in the
  UI.

## Result (2026-11-12)

| Operation                                               | Count |       p50 |       p95 |       p99 |       Max |
| ------------------------------------------------------- | ----: | --------: | --------: | --------: | --------: |
| create strategy                                         |    45 |    101 ms |    705 ms |    742 ms |    742 ms |
| save version                                            |    45 |    347 ms |  1,179 ms |  1,242 ms |  1,242 ms |
| generate                                                |    45 |    246 ms |    861 ms |    908 ms |    908 ms |
| backtest submit (includes engine + persistence, inline) |    45 | 10,288 ms | 17,462 ms | 17,467 ms | 17,467 ms |
| result read                                             |    45 |    194 ms |    516 ms |    536 ms |    536 ms |
| strategies list                                         |    45 |    120 ms |    393 ms |    435 ms |    435 ms |

- 270 requests, **0 failures**, 45/45 backtests completed, total wall time 72.8 s.
- Backtest p95 **17.5 s** (limit 60 s); API p95 **1.18 s** (limit 1.5 s).
- Evidence: `docs/evidence/load-test.json`.

The inline profile is conservative for queue wait: in production the worker processes up to two
jobs concurrently, and polling adds at most 1.5 s to the user-visible completion time. If a cohort
of 45 submits simultaneously, expect a queue of roughly `ceil(45/2)` batches; at ~17 s per job the
worst-case wait is several minutes. The facilitator should ask participants to submit in waves or
scale the worker if the real cohort is larger.

## Reproduce

```bash
LOAD_USERS=45 LOAD_CONCURRENCY=10 bun run scripts/load-test.ts
```

The script exits non-zero if the error rate is not 0, any backtest fails, backtest p95 ≥ 60 s, or
API p95 ≥ 1.5 s. It uses a temporary generated fixture, so it does not need the network.

## Not covered

- TLS termination, Caddy throughput, and external network latency.
- Real Indodax fetch latency during a cold cache. Prefetch the workshop snapshot and keep
  `MARKET_DATA_MODE=fixture` for predictability.
- Live AI provider latency. Template fallback is measured; live model latency is provider-bound and
  capped by `AI_TIMEOUT_MS`.
- Long-running soak tests. Run a 2-hour soak on staging before a public launch.
