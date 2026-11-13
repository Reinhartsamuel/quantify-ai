import { resolve } from "node:path";
import { processBacktestJob } from "@quantify/backtest-runner";
import { loadConfig } from "@quantify/config";
import { createPgliteClient, createPostgresClient, Store } from "@quantify/db";
import { MarketDataService } from "@quantify/market-data";

const env = loadConfig();
const client =
  env.DB_DRIVER === "pglite"
    ? await createPgliteClient(env.PGLITE_PATH === ":memory:" ? undefined : env.PGLITE_PATH)
    : createPostgresClient(env.DATABASE_URL);
const store = new Store(client);
await store.migrate();
const marketData = new MarketDataService({
  mode: env.MARKET_DATA_MODE,
  fixtureDirectory: resolve(env.MARKET_DATA_FIXTURE_DIR),
  cache: {
    readRange: (symbol, timeframe, fromMs, toMs) =>
      store.readCandles(symbol, timeframe, fromMs, toMs),
    upsert: (candles) => store.upsertCandles(candles),
    coverage: () => store.candleCoverage(),
  },
});

const workerId = `${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
let stopping = false;
let active = 0;

function log(level: "info" | "warn" | "error", message: string, meta?: unknown): void {
  console.log(JSON.stringify({ level, type: "worker", workerId, message, ...(meta as object) }));
}

async function tick(): Promise<void> {
  if (stopping) return;
  await store.recoverStaleJobs();
  while (active < env.WORKER_CONCURRENCY && !stopping) {
    const job = await store.claimJob(workerId);
    if (!job) return;
    active += 1;
    void (async () => {
      const started = performance.now();
      try {
        if (job.name !== "backtest.run") {
          await store.failJob(job.id, `Unknown job type: ${job.name}`);
          return;
        }
        const payload = job.payload as { backtestJobId?: string };
        if (!payload.backtestJobId) {
          await store.failJob(job.id, "Missing backtestJobId");
          return;
        }
        const result = await processBacktestJob(payload.backtestJobId, {
          store,
          marketData,
          env,
          logger: log,
        });
        if (result.status === "failed" && result.retryable) {
          const outcome = await store.retryJob(job.id, `${result.code}: ${result.message}`);
          log("warn", "job.retry", { jobId: job.id, outcome });
        } else if (result.status === "failed") {
          await store.failJob(job.id, `${result.code}: ${result.message}`);
        } else {
          await store.completeJob(job.id);
        }
        log("info", "job.finished", {
          jobId: job.id,
          status: result.status,
          durationMs: Math.round(performance.now() - started),
        });
      } catch (error) {
        await store.retryJob(job.id, error instanceof Error ? error.message : "unknown error");
        log("error", "job.error", { jobId: job.id });
      } finally {
        active -= 1;
      }
    })();
  }
}

log("info", "worker.started", { concurrency: env.WORKER_CONCURRENCY, mode: env.MARKET_DATA_MODE });
await tick();
const interval = setInterval(() => void tick(), 1_000);

async function shutdown(signal: string): Promise<void> {
  log("info", "worker.stopping", { signal, active });
  stopping = true;
  clearInterval(interval);
  const deadline = Date.now() + 30_000;
  while (active > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await client.close();
  log("info", "worker.stopped");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
