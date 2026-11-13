# Failure drills

Run:

```bash
bun run failure:drill
```

Evidence: `docs/evidence/failure-drill.json`.

## Scenarios covered

| Scenario                    | What is proven                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `provider_429`              | A retryable market-data error marks the backtest `FAILED` with a safe code/message, never a raw provider response. |
| `retry_after_transient`     | The same failed job can be re-claimed and completes successfully; transient failures are not permanent.            |
| `worker_restart_stale_lock` | A queue job left `RUNNING` with a lock older than five minutes is requeued and reclaimed by another worker.        |
| `queue_max_attempts`        | A transient queue job that reaches its attempt limit becomes `FAILED` instead of looping forever.                  |
| `ai_5xx`                    | An AI provider outage returns a valid template strategy with `generationMeta.fallback=true`.                       |
| `ai_429`                    | AI rate limiting falls back to the template provider.                                                              |
| `ai_timeout`                | An aborted/timed-out provider request falls back to the template provider.                                         |

## Staging drills still required

These need the real container/Postgres topology:

1. Stop/restart Postgres while API and worker are running. Expect `/api/ready` 503 during the
   outage, then 200; in-flight backtests retry or fail safe; no job is silently lost.
2. Reload Caddy and verify TLS renewal/headers.
3. Restore an offsite backup into a staging database and run one backtest against it.
4. Kill the worker mid-job (`SIGKILL`), restart it, and verify the stale-lock recovery completes the
   job or reports a safe failure within the retry window.

Record the observed timestamps and results with the release evidence. Do not mark the release gate
complete until these are done.
