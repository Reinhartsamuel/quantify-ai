# AI reliability

## Provider contract

`StrategyGenerationProvider.generate({ prompt, market })` returns exactly one of:

- `status: "ok"` + a StrategySpec that passes Zod **and** semantic validation;
- `status: "needs_clarification"` + ≤ 3 concrete questions;
- `status: "unsupported"` + a plain-language reason.

The OpenAI-compatible adapter sends a system policy prompt and the user description delimited as
data. It requests `response_format: json_schema` with temperature 0, falls back to `json_object` if
the provider rejects the schema, parses with Zod, and performs **one repair pass** with validation
errors. Timeouts, 401/403, 429, 5xx, and malformed output are mapped to safe codes. Raw provider
responses and prompts are never surfaced or logged.

## Fallback behavior

`GenerationService` uses the deterministic template provider when:

- `AI_MODE=template`;
- the provider is not configured;
- the provider times out, is rate-limited, or is unavailable;
- output is invalid after repair;
- the per-user daily cost estimate would exceed `AI_DAILY_COST_CAP_USD`.

The UI signals template/fallback provenance through `generationMeta`. A fallback still produces a
valid, editable spec or a clarification — it never guesses an uncovered strategy.

## Acceptance set

15 prompts: 10 supported, 3 ambiguous, 3 unsupported/adversarial (shorting/leverage, live exchange
orders, prompt injection), plus an injection-with-valid-strategy case. Run:

```bash
AI_MODE=template bun run ai:acceptance
AI_MODE=openai-compatible bun run ai:acceptance   # uses live provider, falls back per request
```

Recorded result on the committed template build:

- valid spec rate: **100% (10/10 supported prompts)**;
- all expected statuses matched: **yes**;
- fallbacks: **0** in template mode;
- evidence: `docs/evidence/ai-acceptance.json`.

`ai:preflight` validates base URL, key presence, model, timeout, token cap, and cost cap; `--probe`
checks the provider `/models` endpoint without sending a strategy prompt.

## Outage drill

1. Set `AI_MODE=openai-compatible` with a bad key or stop the provider.
2. Submit a supported prompt.
3. Expect HTTP 200 with a template provider result and `generationMeta.fallback=true`; the UI shows
   assumptions and remains usable.
4. Check the audit row: provider `template`, prompt hash only.
5. Restore the provider and confirm a fresh request uses it.

If the template also cannot cover the prompt, the result is clarification/unsupported — not a
fabricated strategy. The facilitator can always switch to a shipped template.

## Cost control

Token counts are recorded per generation. `AI_DAILY_COST_CAP_USD` is evaluated against the sum of
the user's token usage for the current UTC day using configured input/output prices. Once exhausted,
requests use the template fallback. Rate limits (5/hour, 20/day per user, global cap) bound volume.

## Residual risks

- A prompt injection could still influence the _content_ of a generated spec; it cannot change the
  allowlists, execute code, or bypass validation. Review output before saving.
- The template fallback covers common EMA/SMA/RSI/Bollinger prompts, not arbitrary compositions.
- Provider JSON-schema support varies; the JSON-mode fallback is tested with the same parser/repair.
