# StrategySpec v1

Status: **frozen**. Zod is the source of truth in `packages/strategy-spec/src/schema.ts`; the JSON
Schema used by the AI provider is generated from the same Zod schema. Any change requires updating
the JSON schema, golden fixtures, contracts, engine, and AI prompt in one change.

## Top-level shape

```json
{
  "schemaVersion": "1.0",
  "name": "BTC EMA 20/50 crossover",
  "description": "Long-only trend strategy on BTC/IDR 1h.",
  "market": {
    "venue": "indodax",
    "marketType": "spot",
    "symbol": "BTC/IDR",
    "timeframe": "1h"
  },
  "indicators": [
    { "id": "ema_fast", "type": "ema", "source": "close", "period": 20 },
    { "id": "ema_slow", "type": "ema", "source": "close", "period": 50 }
  ],
  "entry": {
    "operator": "crosses_above",
    "left": { "indicator": "ema_fast" },
    "right": { "indicator": "ema_slow" }
  },
  "exit": {
    "operator": "crosses_below",
    "left": { "indicator": "ema_fast" },
    "right": { "indicator": "ema_slow" }
  },
  "risk": {
    "positionSizing": { "type": "percent_equity", "value": 90 },
    "stopLossPct": 5,
    "takeProfitPct": null,
    "maxOpenPositions": 1
  }
}
```

All objects reject unknown keys.

## Allowlists and bounds

| Field                     | Allowed values                                                     |
| ------------------------- | ------------------------------------------------------------------ |
| `market.venue`            | `indodax`                                                          |
| `market.marketType`       | `spot`                                                             |
| `market.symbol`           | `BTC/IDR`, `ETH/IDR`                                               |
| `market.timeframe`        | `1h`, `4h`                                                         |
| indicator `type`          | `ema`, `sma`, `rsi`, `bollinger`                                   |
| indicator `source`        | `open`, `high`, `low`, `close` (RSI/Bollinger: `close` only)       |
| EMA/SMA period            | 2–200                                                              |
| RSI period                | 2–50                                                               |
| Bollinger period / stdDev | 5–200 / 1–3                                                        |
| operators                 | `greater_than`, `less_than`, `crosses_above`, `crosses_below`      |
| compositions              | `all` (AND), `any` (OR); depth ≤ 3, combined nodes ≤ 20, non-empty |
| RSI constants             | 0–100                                                              |
| position sizing           | `percent_equity`, 1–100%                                           |
| stop loss / take profit   | 0.1–50% / 0.1–100%, or `null`                                      |
| `maxOpenPositions`        | exactly `1`                                                        |

## Semantic rules

- Indicator IDs are unique and non-empty.
- Every indicator reference resolves to a declared indicator.
- `bollinger` additionally exposes `upper`, `middle`, `lower`; other indicators expose `value`.
- A crossover between two averages of the same type requires the left period to be shorter than the
  right period (`fast < slow`).
- A crossover between two constants is rejected because it can never change.
- Entry and exit conditions cannot be empty.
- Unsupported market, indicator, source, output, operator, or risk values are rejected with a
  path-specific error such as `entry.right.constant: RSI thresholds must be between 0 and 100.`

## Rendering

The renderer produces plain-language entry, exit, risk, and indicator summaries. The UI shows these
first; raw JSON is a read-only disclosure. The AI explanation may only restate the rules — it must
not add facts or claim predictive power.

## Three required examples

1. **EMA crossover** — `packages/strategy-spec/src/templates.ts` (`ema-crossover`).
2. **RSI mean reversion** — `templates.ts` (`rsi-mean-reversion`), entry when RSI crosses above 30,
   exit when RSI is above 70.
3. **Ambiguous prompt** — “Buy when it goes up and sell when it goes down” returns
   `needs_clarification` with concrete questions. See `packages/ai/src/acceptance.ts`
   (`ambiguous-direction`). It never invents thresholds or indicators.

## Interop

- `strategySpecJsonSchema()` exports the provider schema.
- `parseStrategySpec(value)` returns either a validated spec or a list of `{path, code, message}`.
- `assertValidSpec` throws `SpecValidationError` for engine and compiler inputs.
- The engine hashes the canonical spec; AI output cannot bypass Zod or semantic validation.
