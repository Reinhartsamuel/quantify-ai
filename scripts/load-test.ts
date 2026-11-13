import { makeTestApp, signUp } from "../tests/helpers.ts";
import { writeEvidence } from "./evidence.js";

type Sample = { label: string; ms: number; ok: boolean; status: number };

const users = Number(process.env.LOAD_USERS ?? 45);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 10);
const rangeEnd = "2025-07-01T00:00:00.000Z";
const config = {
  initialCapital: 10_000_000,
  startTime: "2025-01-01T00:00:00.000Z",
  endTime: rangeEnd,
  feeRateBps: 20,
  slippageBps: 5,
  executionTiming: "next_candle_open",
};
const rsiSpec = {
  schemaVersion: "1.0",
  name: "Load RSI",
  description: "Load test RSI strategy",
  market: { venue: "indodax", marketType: "spot", symbol: "BTC/IDR", timeframe: "1h" },
  indicators: [{ id: "rsi", type: "rsi", source: "close", period: 14 }],
  entry: { operator: "crosses_above", left: { indicator: "rsi" }, right: { constant: 30 } },
  exit: { operator: "greater_than", left: { indicator: "rsi" }, right: { constant: 70 } },
  risk: {
    positionSizing: { type: "percent_equity", value: 90 },
    stopLossPct: 6,
    takeProfitPct: 12,
    maxOpenPositions: 1,
  },
};

const { app, client } = await makeTestApp({
  fixtureCount: 5000,
  env: { RATE_LIMIT_ENABLED: "false" },
});
const samples: Sample[] = [];
let failures = 0;
let completed = 0;

function record(label: string, ms: number, status: number) {
  samples.push({ label, ms, ok: status < 400, status });
  if (status >= 400) failures += 1;
}

async function call(label: string, fn: () => Response | Promise<Response>): Promise<Response> {
  const started = performance.now();
  const response = await fn();
  record(label, Math.round(performance.now() - started), response.status);
  return response;
}

async function runUser(index: number): Promise<void> {
  const session = await signUp(app, `load-${index}-${crypto.randomUUID()}@example.com`);
  const created = await call("create_strategy", () =>
    app.request("/api/v1/strategies", {
      method: "POST",
      headers: session.headers,
      body: JSON.stringify({ name: `Load ${index}`, description: "load" }),
    }),
  );
  if (created.status !== 201) return;
  const strategyId = ((await created.json()) as { strategy: { id: string } }).strategy.id;
  const saved = await call("save_version", () =>
    app.request(`/api/v1/strategies/${strategyId}/versions`, {
      method: "POST",
      headers: session.headers,
      body: JSON.stringify({ spec: rsiSpec }),
    }),
  );
  if (saved.status !== 201) return;
  const versionId = ((await saved.json()) as { version: { id: string } }).version.id;
  const generated = await call("generate", () =>
    app.request("/api/v1/strategies/generate", {
      method: "POST",
      headers: session.headers,
      body: JSON.stringify({
        prompt: "Buy BTC when RSI 14 crosses above 30 and sell when RSI is above 70.",
        symbol: "BTC/IDR",
        timeframe: "1h",
      }),
    }),
  );
  if (generated.status !== 200) return;
  const submitted = await call("backtest_submit", () =>
    app.request("/api/v1/backtests", {
      method: "POST",
      headers: session.headers,
      body: JSON.stringify({ strategyVersionId: versionId, config }),
    }),
  );
  if (submitted.status !== 202) return;
  const job = (await submitted.json()) as { backtestId: string; status: string };
  if (job.status !== "COMPLETED") {
    failures += 1;
    return;
  }
  completed += 1;
  const detail = await call("backtest_result", () =>
    app.request(`/api/v1/backtests/${job.backtestId}`, { headers: session.headers }),
  );
  if (detail.status !== 200) return;
  await call("strategies_list", () =>
    app.request("/api/v1/strategies", { headers: session.headers }),
  );
}

const started = performance.now();
let cursor = 0;
async function worker() {
  while (cursor < users) {
    const index = cursor;
    cursor += 1;
    try {
      await runUser(index);
    } catch (error) {
      failures += 1;
      console.error(error);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const totalMs = Math.round(performance.now() - started);
await client.close();

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[index] as number;
}

const labels = [...new Set(samples.map((sample) => sample.label))];
const summary = Object.fromEntries(
  labels.map((label) => {
    const values = samples.filter((sample) => sample.label === label).map((sample) => sample.ms);
    return [
      label,
      {
        count: values.length,
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
        max: Math.max(...values, 0),
      },
    ];
  }),
);
const backtest = summary.backtest_submit ?? { p95: 0 };
const p95Api = Math.max(
  ...Object.entries(summary)
    .filter(([label]) => label !== "backtest_submit")
    .map(([, stats]) => stats.p95),
  0,
);
const errorRate = samples.length === 0 ? 1 : failures / samples.length;
const passed = errorRate === 0 && completed === users && backtest.p95 < 60_000 && p95Api < 1_500;

const evidence = {
  generatedAt: new Date().toISOString(),
  profile: {
    users,
    concurrency,
    workerConcurrency: 2,
    maxCandles: 20_000,
    pollingIntervalMs: 1_500,
    backtestRange: config,
    mode: "in-process Hono app + PGlite + fixture data",
    note: "Measures application, engine, and database work without TLS/network. Rate limits are disabled for the capacity run; they are covered by integration tests.",
  },
  durationMs: totalMs,
  requests: samples.length,
  failures,
  errorRate,
  completedBacktests: completed,
  summary,
  backtestP95Ms: backtest.p95,
  apiP95Ms: p95Api,
  thresholds: { errorRate: 0, backtestP95Ms: 60_000, apiP95Ms: 1_500 },
  passed,
};
writeEvidence("load-test.json", evidence);
console.log(JSON.stringify(evidence, null, 2));
if (!passed) process.exit(1);
