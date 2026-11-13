# Market data reliability

## Modes

- `MARKET_DATA_MODE=indodax` — read Postgres candles for the range; fetch missing data from Indodax
  in chunks, upsert, then read the canonical range. The last cached chunk is refreshed so a
  previously partial candle is replaced.
- `MARKET_DATA_MODE=fixture` — read the committed workshop snapshot. No network. Missing series or
  ranges outside the snapshot fail with `MARKET_DATA_UNAVAILABLE`, never with synthetic candles.

The API and worker share the same `MarketDataService`. A backtest stores the manifest on the job and
in the engine output.

## Prefetch and verification

```bash
bun run data:prefetch   # network; writes *.json.gz + manifest.json
bun run data:verify     # recomputes counts, first/last, gaps, zero-volume, SHA-256
```

`data:prefetch` uses 600-candle pages because Indodax caps responses near 649 rows and otherwise
silently returns only the latest slice. The first year-chunk attempt produced periodic 251-candle
gaps; the committed snapshot has **0 gaps** for all four series. See `indodax-coverage.md`.

## Health checks

- `GET /api/ready` — database, queue stats, market-data mode/series count. 503 when degraded.
- `GET /api/health/market-data` — per symbol/timeframe candle count, first/last timestamp, expected
  workshop candle count, and `workshopRangeCovered`. 503 if any series is missing.
- `GET /api/health/queue` — queued/running/failed counts and depth alert (>100).
- Worker logs `backtest.completed` and `backtest.failed` with job ID and code, never prompts.

## Gap and zero-volume policy

- Any gap longer than 24 candles or total missing >10% fails the range with `DATA_QUALITY_GAP`.
- Smaller gaps warn; missing candles are never filled.
- Zero-volume candles are kept and warned. They can flatten indicators and should be mentioned
  when interpreting results.

## Failure modes and actions

| Failure                  | Detection                                                        | Action                                                    |
| ------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------- |
| Indodax 429/5xx          | Adapter retry, then `MARKET_DATA_UNAVAILABLE`                    | Retry later; switch to fixture mode                       |
| Partial final candle     | Trim `timestamp + timeframe > end`                               | Automatically excluded                                    |
| Cached range incomplete  | Coverage/expected check fetches missing data                     | Automatic; verify worker logs                             |
| Snapshot missing/corrupt | `data:verify` fails; `/api/health/market-data` 503               | Re-run prefetch or restore snapshot from release artifact |
| Gap above policy         | `DATA_QUALITY_GAP`                                               | Use another range; do not patch the data                  |
| Worker crash mid-run     | Stale queue recovery after 5 minutes; backtest can be re-claimed | Restart worker; check `/api/health/queue`                 |
| Database down            | `/api/ready` 503                                                 | Restore/restart; API and worker resume from Postgres      |

## Reproducibility

The manifest SHA-256 and engine output hash are stored with every completed backtest. Running the
same version, config, and manifest twice produces identical trades and equity. `scripts/demo-fixture.ts`
also verifies the demo strategy is deterministic and, with `--live`, that fixture and live candle
sets produce the same content hash for the demo range. Recorded evidence:
`docs/evidence/demo-fixture.json` — identical candles and output on 2026-11-12.
