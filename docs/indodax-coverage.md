# Indodax historical data: coverage and reliability

Last measured: **2026-11-12** (UTC). Provider: public Indodax endpoint
`GET https://indodax.com/tradingview/history_v2`.

## Verified workshop window

| Symbol  | Timeframe | Candles | First candle (UTC) | Last candle (UTC) | Gaps | Zero-volume | SHA-256                                                            |
| ------- | --------- | ------: | ------------------ | ----------------- | ---: | ----------: | ------------------------------------------------------------------ |
| BTC/IDR | 1h        |  13,080 | 2025-01-01 00:00   | 2026-06-29 23:00  |    0 |          11 | `ae03a6c2beb236116b6d0978ad6e18f6bab5dc2a12ae6c48af81bea7374425f3` |
| BTC/IDR | 4h        |   3,270 | 2025-01-01 00:00   | 2026-06-29 20:00  |    0 |           0 | `ce0c8fd2cec3ea6bf4b87c12f30002abe024e3d7c4ab058fc7f68bc302c61b08` |
| ETH/IDR | 1h        |  13,080 | 2025-01-01 00:00   | 2026-06-29 23:00  |    0 |          12 | `d123257e0b209ab99e362c9374ee85d9e2aec0633d7c386b557d9990909c3c7b` |
| ETH/IDR | 4h        |   3,270 | 2025-01-01 00:00   | 2026-06-29 20:00  |    0 |           0 | `aad58d2bdb22babab4383b1a03de5aaf8ff885a2c87382a7f8363ee825d3405c` |

The workshop range is `2025-01-01T00:00:00Z` → `2026-06-30T00:00:00Z` (exclusive end, so the last complete candle is 2026-06-29 23:00 for 1h and 20:00 for 4h). The committed fixture is 740 KB compressed in
`tests/fixtures/market-data/workshop/`.

Zero-volume candles are kept, not dropped. Two series contain 11–12 such candles; they are
reported to users in the result warnings and counted in the data manifest.

## Provider behavior that matters

- `from` and `to` are Unix **seconds**. The response `Time` is seconds. The adapter multiplies by
  1000 and converts OHLC fields to numbers; `Volume` is parsed with `Number`.
- The endpoint returns at most about **649 rows per request**, even when the requested span is
  larger. The first implementation asked for one year and silently received only the most recent
  part, which produced artificial 251-candle gaps. The adapter now requests at most **600 candles
  per call** (`600 × timeframe seconds`) and paginates. This is covered by the adapter test that
  asserts multiple calls and >1,900 rows for a 2,000-hour range.
- The adapter trims `Time < from` and excludes candles whose close time exceeds the requested end,
  so a partial last candle is never used.
- Requests are limited to ≤ 2 req/s (the prefetch uses 1.5 req/s). On `429`/`5xx` the adapter backs
  off exponentially, respects `Retry-After` when present, and retries up to three times. Errors are
  classified as `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `NO_DATA`, or `INVALID_RESPONSE`.
- A full refresh of all four series at 1.5 req/s took ~36 seconds and produced the snapshot above.

## Validation and gap policy

For every backtest range:

- timestamps must be strictly increasing and unique;
- `low <= open, close <= high`, `high >= low`, all values finite, volume ≥ 0;
- missing candles are counted as gaps and **never synthesized**;
- a gap is a failure if any gap is longer than 24 candles or if total missing candles exceed 10% of
  the expected range;
- zero-volume candles are kept, counted, and warned about.

The engine records the data manifest (`provider`, endpoint, symbol, timeframe, requested range,
fetchedAt, candle count, first/last timestamp, SHA-256, gaps, zero-volume) on the result. The
SHA-256 is computed over a canonical array of `[timestamp, open, high, low, close, volume]` rows.

## Commands

```bash
# Refresh the committed workshop snapshot from Indodax (network required).
bun run data:prefetch

# Re-read the snapshot, recompute the hash, and fail if anything drifted.
bun run data:verify

# Compare the demo strategy on fixture data with a live fetch (network required).
bun run scripts/demo-fixture.ts --live
```

`data:prefetch` uses `WORKSHOP_FROM` / `WORKSHOP_TO` / `SNAPSHOT_DIR` to override defaults. It
writes both the `.json.gz` series and `manifest.json`; the manifest includes each gap range and
fetch latency for audit.

## Known limits

- Only BTC/IDR and ETH/IDR, 1h and 4h, long-only spot.
- Indodax history can be revised at the tail; the cache refreshes the last cached chunk before use.
  Snapshot hashes are evidence for the workshop date, not a permanent market record.
- The endpoint has no SLA. The fixture snapshot is the workshop fallback. If live refresh fails
  during the workshop, run in `MARKET_DATA_MODE=fixture`; the demo output is verified to be
  identical for the demo range (`docs/evidence/demo-fixture.json`).
