# Release evidence

Generated on 2026-11-12 UTC from this checkout.

| File                 | Command                                                           | Result                                                                                                     |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `demo-fixture.json`  | `MARKET_DATA_MODE=fixture bun run scripts/demo-fixture.ts --live` | Fixture and live candles identical; demo content hash identical; +2.82%, 23 trades                         |
| `ai-acceptance.json` | `AI_MODE=template bun run ai:acceptance`                          | 100% valid specs (10/10); all 15 expected statuses matched                                                 |
| `load-test.json`     | `LOAD_USERS=45 LOAD_CONCURRENCY=10 bun run scripts/load-test.ts`  | 270 requests, 0 failures, 45 backtests; API p95 1.18 s; backtest p95 17.5 s                                |
| `failure-drill.json` | `bun run scripts/failure-drill.ts`                                | Provider 429, 5xx, timeout fallback; retry-after-transient; stale worker lock recovery; queue max attempts |
| `design-check.json`  | `bun run scripts/design-check.ts`                                 | Semantic tokens only; tabular numerals; focus; reduced motion; mobile breakpoints; no fake social proof    |

Additional commands:

```bash
bun run data:verify
bun run test
bun run typecheck
bun run build
```

`docs/release-gate.md` records the remaining human/staging gates (axe, screenshots, usability
rehearsal, restore drill, offsite backup, BlockDev.id logistics).
