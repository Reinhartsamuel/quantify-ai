import { GenerationService, OpenAICompatibleProvider } from "@quantify/ai";
import { hashPassword } from "@quantify/auth";
import { processBacktestJob } from "@quantify/backtest-runner";
import { ENGINE_VERSION, loadConfig } from "@quantify/config";
import { createPgliteClient, Store } from "@quantify/db";
import { hashObject, MarketDataError, MarketDataService } from "@quantify/market-data";
import { parseStrategySpec, TEMPLATES } from "@quantify/strategy-spec";
import { makeFixtureDirectory } from "../tests/helpers.ts";
import { writeEvidence } from "./evidence.js";

const env = loadConfig({
  NODE_ENV: "test",
  APP_ENV: "local",
  SESSION_SECRET: "failure-drill-secret-long-enough",
  MARKET_DATA_MODE: "fixture",
  AI_MODE: "template",
  DB_DRIVER: "pglite",
  RATE_LIMIT_ENABLED: "false",
  LOG_LEVEL: "error",
});
const fixtureDirectory = makeFixtureDirectory(5000);
const client = await createPgliteClient();
const store = new Store(client);
await store.migrate();
const user = await store.createUser({
  email: `drill-${crypto.randomUUID()}@example.com`,
  passwordHash: hashPassword("drill-password-123"),
  name: "Failure drill",
});
const template = TEMPLATES[1]!;
const parsed = parseStrategySpec(template.spec);
if (!parsed.ok) throw new Error("template invalid");
const strategy = await store.createStrategy({
  userId: user.id,
  name: "Drill strategy",
  description: "Failure drill",
});
const version = await store.createVersion({
  strategyId: strategy.id,
  spec: parsed.spec,
  specHash: hashObject(parsed.spec),
  schemaVersion: "1.0",
});
const config = {
  initialCapital: 10_000_000,
  startTime: "2025-01-01T00:00:00.000Z",
  endTime: "2025-03-01T00:00:00.000Z",
  feeRateBps: 20,
  slippageBps: 5,
  executionTiming: "next_candle_open" as const,
};
const inserted = await store.insertBacktestJob({
  userId: user.id,
  strategyVersionId: version.id,
  config,
  configHash: hashObject(config),
  engineVersion: ENGINE_VERSION,
});
const jobId = inserted.job.id;
const results: Array<Record<string, unknown>> = [];

const failingMarketData = {
  getCandles: async () => {
    throw new MarketDataError(
      "RATE_LIMITED",
      "Indodax rate limit reached. Retrying shortly.",
      true,
    );
  },
  coverage: async () => [],
} as unknown as MarketDataService;
const failed = await processBacktestJob(jobId, {
  store,
  marketData: failingMarketData,
  env,
});
const afterFail = await store.getBacktest(jobId);
results.push({
  scenario: "provider_429",
  expected: "FAILED with retryable safe code",
  pass:
    failed.status === "failed" &&
    failed.code === "RATE_LIMITED" &&
    failed.retryable === true &&
    afterFail?.status === "FAILED" &&
    (afterFail?.error_message_safe ?? "").length > 0,
  observed: { failed, status: afterFail?.status, code: afterFail?.error_code },
});

const marketData = new MarketDataService({ mode: "fixture", fixtureDirectory });
const retried = await processBacktestJob(jobId, { store, marketData, env });
const afterRetry = await store.getBacktest(jobId);
results.push({
  scenario: "retry_after_transient",
  expected: "COMPLETED with result",
  pass:
    retried.status === "completed" &&
    afterRetry?.status === "COMPLETED" &&
    Boolean(afterRetry.output_hash),
  observed: { retried, status: afterRetry?.status, outputHash: afterRetry?.output_hash },
});

// Worker restart: a claimed job whose lock is stale must be recoverable.
const queueId = await store.enqueueJob({
  name: "backtest.run",
  payload: { backtestJobId: jobId },
  maxAttempts: 3,
});
const claimed = await store.claimJob("drill-worker-1");
await client.query("UPDATE job_queue SET locked_at = now() - interval '10 minutes' WHERE id = $1", [
  queueId,
]);
const recovered = await store.recoverStaleJobs(300);
const reclaimed = await store.claimJob("drill-worker-2");
results.push({
  scenario: "worker_restart_stale_lock",
  expected: "stale RUNNING job requeued and reclaimable",
  pass: claimed?.id === queueId && recovered === 1 && reclaimed?.id === queueId,
  observed: { claimed: claimed?.id, recovered, reclaimed: reclaimed?.id },
});
if (reclaimed) await store.completeJob(queueId);

// Queue retry/backoff and max attempts.
const retryId = await store.enqueueJob({ name: "backtest.run", payload: {}, maxAttempts: 1 });
await store.claimJob("drill-worker-3");
const retryOutcome = await store.retryJob(retryId, "transient");
results.push({
  scenario: "queue_max_attempts",
  expected: "failed after max attempts",
  pass: retryOutcome === "failed",
  observed: { retryOutcome },
});

// AI provider failures fall back to the deterministic template.
async function fallbackFor(name: string, fetchImpl: typeof fetch, expectedReason: string) {
  const openai = new OpenAICompatibleProvider({
    baseUrl: "https://provider.invalid/v1",
    apiKey: "test",
    model: "test",
    timeoutMs: 50,
    maxOutputTokens: 300,
    fetchImpl,
  });
  const service = new GenerationService({ mode: "openai-compatible", openai });
  const outcome = await service.generate({
    prompt: "Buy BTC when the 20 EMA crosses above the 50 EMA.",
    market: { venue: "indodax", symbol: "BTC/IDR", timeframe: "1h" },
  });
  results.push({
    scenario: name,
    expected: `fallback template (${expectedReason})`,
    pass:
      outcome.result.status === "ok" &&
      outcome.result.provider === "template" &&
      outcome.meta.fallback === true &&
      outcome.meta.fallbackReason === expectedReason,
    observed: { status: outcome.result.status, meta: outcome.meta },
  });
}

await fallbackFor(
  "ai_5xx",
  (async () => new Response("down", { status: 503 })) as typeof fetch,
  "AI_PROVIDER_UNAVAILABLE",
);
await fallbackFor(
  "ai_429",
  (async () => new Response("slow", { status: 429 })) as typeof fetch,
  "AI_RATE_LIMITED",
);
await fallbackFor(
  "ai_timeout",
  (async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  }) as typeof fetch,
  "AI_TIMEOUT",
);

// Database availability is a staging drill: closing PGlite and checking the
// store fails without leaking internals is covered by /api/ready semantics.
await client.close();

const passed = results.every((result) => result.pass === true);
const evidence = {
  generatedAt: new Date().toISOString(),
  jobId,
  passed,
  results,
  pendingStagingDrills: [
    "Postgres restart with API/worker reconnect and /api/ready 503→200",
    "Caddy reload/TLS renewal",
    "Offsite backup restore",
  ],
};
writeEvidence("failure-drill.json", evidence);
console.log(JSON.stringify(evidence, null, 2));
if (!passed) process.exit(1);
