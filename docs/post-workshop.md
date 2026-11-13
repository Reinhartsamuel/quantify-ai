# After the workshop

## Access

Confirm with BlockDev.id how long participants keep access. If accounts remain active:

- keep the API, worker, Postgres, and Caddy running;
- keep the market-data snapshot and `MARKET_DATA_MODE=fixture` for deterministic demos;
- keep `AI_MODE=template` unless a budgeted provider key is configured;
- monitor `/api/ready`, `/api/health/queue`, and disk usage weekly.

If access ends, schedule a shutdown: export aggregate metrics, take a final backup, notify users,
then stop services. Do not delete the database until the backup is verified offsite.

## Metrics to review

From the product database and request logs (no prompts or passwords):

- registered users, users with ≥ 1 strategy, users with ≥ 1 completed backtest;
- generation success rate and template/fallback share;
- backtest completion and failure codes;
- time from sign-up to first completed backtest;
- 7-day return rate (sessions or sign-ins after the event);
- most-used templates and ranges;
- support requests and recurring blockers.

Compare against the workshop targets in the PRD: ≥ 70% create a strategy, ≥ 60% complete a backtest,
≥ 90% valid generation on supported prompts, ≥ 95% completed valid backtests.

## Feedback

Send a short survey:

1. What did you try to test, and did the tool make it possible?
2. Which screen or term was confusing?
3. Did anything look like a promise of profit? (If yes, investigate.)
4. Would you use this again for a different idea? Why?
5. What would you pay for, if anything?

Record qualitative willingness-to-pay responses separately from usage metrics.

## Data retention and privacy

Agree retention with BlockDev.id. Minimum recommended: retain account data for the agreed access
period; retain anonymized aggregate metrics longer. Do not retain full prompts in logs (they are not
logged). Prompt hashes and saved source prompts are part of user-authored strategy data; include
them in deletion/export policy.

## Next iteration candidates

- Walk-forward / out-of-sample split and an explicit overfitting warning.
- More indicators only after reference tests pass.
- Strategy comparison with identical config enforcement (currently labelled when configs differ).
- Email verification/password reset if the product continues.
- Paper trading only after security, compliance, and operations review.

## Archive

Tag the release, keep `docs/evidence/`, the snapshot, and the final backup together. Record the
workshop date, cohort size, and any fallback used in the release notes so future runs have context.
