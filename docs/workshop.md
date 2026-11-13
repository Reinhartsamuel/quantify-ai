# Workshop facilitator runbook (English)

Product: **Quantify — AI Trading Strategy Lab** (provisional name).
Audience: BlockDev.id crypto workshop, mixed traders and beginners.
Default format: 3 hours for traders, 4 hours for beginners. Duration, cohort size, laptop and
internet assumptions, and post-event access are still **to be confirmed with BlockDev.id**.

## What participants can do

Describe a strategy → generate structured rules → review/edit → validate → save an immutable
version → run a deterministic backtest → read metrics, trades, assumptions, and warnings → iterate.

Everything is simulation-only. No exchange keys, no live orders, no custody, no leverage, no
shorting. The product is not investment advice.

## T-1 day preflight (30 minutes)

1. Confirm the deployed domain opens over HTTPS and `/api/health` returns `status: ok`.
2. Confirm `/api/ready` is ready and `/api/health/market-data` shows all four series with
   `workshopRangeCovered: true`.
3. Run `bun run data:verify` on the server or a laptop and store the output.
4. Run `bun run ai-preflight -- --probe` if using a live model. Keep `AI_MODE=template` as fallback.
5. Sign in as the demo user and run the known-good demo backtest below. Confirm a completed result.
6. Confirm the share link opens in a private window and shows no account data.
7. Export or record a local backup of the committed workshop snapshot
   (`tests/fixtures/market-data/workshop/`) and keep it available offline.
8. Take screenshots of the demo result; keep them as a last-resort fallback if the network fails.

Demo credentials are seeded with:

```bash
DEMO_EMAIL=demo@quantify.local
DEMO_PASSWORD=workshop-demo-2026   # change before the event; never commit the real value
```

The seeded demo account is flagged **Demo account** in the UI.

## Known-good demo (rehearse this)

1. Sign in as the demo user.
2. Open **Strategies → RSI mean reversion**.
3. Open version 1, choose **1M** or set **2025-01-01 → 2025-07-01** (UTC).
4. Initial capital 10,000,000 IDR, fee 20 bps, slippage 5 bps, execution next candle open.
5. Submit. Expected on the committed snapshot: **+2.82% net return**, **23 trades**, **16.65% max drawdown**, ending equity
   ~10.28M IDR, with a visible equity/drawdown chart.
6. Point out assumptions and warnings, then open **Version comparison** and compare with the EMA
   template to show that a different rule produces a different result.

The result is a property of this exact range and snapshot. Do not present it as expected future
return. If the live tail differs, use `MARKET_DATA_MODE=fixture` and the committed snapshot.

## Suggested 3-hour flow

| Time      | Segment           | Action                                                 |
| --------- | ----------------- | ------------------------------------------------------ |
| 0:00–0:15 | Framing           | Systematic vs discretionary; simulation boundary       |
| 0:15–0:35 | Product tour      | Dashboard, templates, `/learn`; metric definitions     |
| 0:35–1:05 | Guided build      | Generate EMA crossover, inspect rules and assumptions  |
| 1:05–1:25 | Edit + validate   | Change periods, save v2, explain immutability          |
| 1:25–1:55 | Backtest          | Choose range; read fees, drawdown, trades; CSV         |
| 1:55–2:10 | Break             | —                                                      |
| 2:10–2:40 | Compare           | v1 vs v2; why a backtest is not a promise              |
| 2:40–3:00 | Independent build | Participants create one strategy; facilitator unblocks |

For beginners, add 45 minutes before the guided build for `/learn` and a paper exercise on entry,
exit, and position sizing.

## Troubleshooting

| Symptom                                                    | Likely cause                        | Action                                     |
| ---------------------------------------------------------- | ----------------------------------- | ------------------------------------------ |
| “The selected range is outside the workshop data snapshot” | Snapshot is missing or stale        | Switch to fixture mode; verify manifest    |
| Backtest stuck in QUEUED                                   | Worker not running or queue blocked | Check `/api/health/queue`; restart worker  |
| Backtest FAILED with `DATA_QUALITY_GAP`                    | Live data has a gap above policy    | Use the snapshot range or a shorter range  |
| Generation shows template assumptions                      | AI provider down or no key          | Expected fallback; continue with templates |
| 429                                                        | Per-user workshop limit             | Wait for the stated window; use a template |
| 503 on `/api/ready`                                        | Database or fixture unavailable     | Follow incident checklist; use screenshots |

## Fallback ladder

1. **AI outage** → template provider is automatic; do not wait.
2. **Indodax outage** → fixture snapshot; restart API with `MARKET_DATA_MODE=fixture`.
3. **Database/worker outage** → use the facilitator's pre-run result and share link; switch the
   session to the recorded demo/screenshot walkthrough.
4. **Total platform outage** → present from screenshots and run the paper exercise; do not attempt
   live troubleshooting in front of the room for more than five minutes.

## Data and safety notes to say out loud

- History is Indodax BTC/IDR and ETH/IDR, 1h/4h, 2025-01-01 to 2026-06-30 UTC.
- Gaps are never filled; zero-volume candles are kept.
- Fees and slippage are assumptions. Real execution can be worse.
- A single in-sample backtest is a hypothesis, not evidence of future profit.
- The tool cannot place orders or hold funds.

## After the event

Keep accounts active as agreed with BlockDev.id. Review activation and return metrics from the
product database. Archive the snapshot and release evidence with the release tag. See
`docs/post-workshop.md`.
