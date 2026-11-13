import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { GenerationService } from "@quantify/ai";
import { AuthService } from "@quantify/auth";
import { processBacktestJob } from "@quantify/backtest-runner";
import { type Env, loadConfig } from "@quantify/config";
import { createPgliteClient, Store } from "@quantify/db";
import { type Candle, MarketDataService } from "@quantify/market-data";
import { createApp } from "../apps/api/src/app.js";

const START = Date.parse("2025-01-01T00:00:00.000Z");
const HOUR = 3_600_000;

export function makeFixtureDirectory(count = 500): string {
  const directory = mkdtempSync(join(tmpdir(), "quantify-fixture-"));
  mkdirSync(directory, { recursive: true });
  for (const symbol of ["BTCIDR", "ETHIDR"] as const) {
    const candles: Candle[] = [];
    for (let index = 0; index < count; index += 1) {
      const close = 1_000 + Math.sin(index / 7) * 80 + index * 0.4;
      const open = index === 0 ? close : candles[index - 1]!.close;
      candles.push({
        venue: "indodax",
        symbol: symbol === "BTCIDR" ? "BTC/IDR" : "ETH/IDR",
        timeframe: "1h",
        timestamp: START + index * HOUR,
        open,
        high: Math.max(open, close) + 5,
        low: Math.min(open, close) - 5,
        close,
        volume: 10,
      });
    }
    writeFileSync(
      join(directory, `${symbol}-1h.json.gz`),
      gzipSync(
        JSON.stringify(
          candles.map((candle) => ({
            t: candle.timestamp,
            o: candle.open,
            h: candle.high,
            l: candle.low,
            c: candle.close,
            v: candle.volume,
          })),
        ),
      ),
    );
  }
  return directory;
}

export function testEnv(fixtureDirectory: string, overrides: Record<string, string> = {}): Env {
  return loadConfig({
    NODE_ENV: "test",
    APP_ENV: "local",
    APP_URL: "http://localhost:3000",
    API_URL: "http://localhost:3001",
    SESSION_SECRET: "test-secret-that-is-long-enough",
    TRUSTED_ORIGINS: "http://localhost:3000",
    COOKIE_SECURE: "false",
    MARKET_DATA_MODE: "fixture",
    MARKET_DATA_FIXTURE_DIR: fixtureDirectory,
    AI_MODE: "template",
    DB_DRIVER: "pglite",
    PGLITE_PATH: ":memory:",
    RATE_LIMIT_ENABLED: "false",
    WORKER_INLINE: "true",
    LOG_LEVEL: "error",
    ...overrides,
  });
}

export async function makeTestApp(
  options: { fixtureCount?: number; env?: Record<string, string> } = {},
) {
  const directory = makeFixtureDirectory(options.fixtureCount);
  const env = testEnv(directory, options.env);
  const client = await createPgliteClient();
  const store = new Store(client);
  await store.migrate();
  const marketData = new MarketDataService({ mode: "fixture", fixtureDirectory: directory });
  const ai = new GenerationService({ mode: "template" });
  const auth = new AuthService(store, env);
  const processJob = (jobId: string) => processBacktestJob(jobId, { store, marketData, env });
  const app = createApp({ store, auth, env, ai, marketData, processJob });
  return { app, store, env, marketData, client, directory };
}

export type SessionHeaders = {
  cookie: string;
  csrf: string;
  headers: Record<string, string>;
};

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? single.split(/,(?=[^;]+=)/) : [];
}

export function extractSession(response: Response): SessionHeaders {
  const cookies = getSetCookies(response);
  const session = cookies.find((value) => value.startsWith("quantify_session="));
  const csrfCookie = cookies.find((value) => value.startsWith("quantify_csrf="));
  if (!session || !csrfCookie) throw new Error("Session cookies missing from response");
  const sessionValue = session.split(";")[0] as string;
  const csrfValue = csrfCookie.split(";")[0]?.split("=")[1] ?? "";
  return {
    cookie: `${sessionValue}; quantify_csrf=${decodeURIComponent(csrfValue)}`,
    csrf: decodeURIComponent(csrfValue),
    headers: {
      cookie: `${sessionValue}; quantify_csrf=${decodeURIComponent(csrfValue)}`,
      "x-csrf-token": decodeURIComponent(csrfValue),
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
  };
}

export async function signUp(
  app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
  email = `user-${crypto.randomUUID()}@example.com`,
): Promise<SessionHeaders> {
  const response = await Promise.resolve(
    app.request("/api/auth/sign-up", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password: "correct-horse-battery" }),
    }),
  );
  if (response.status !== 201)
    throw new Error(`Sign-up failed: ${response.status} ${await response.text()}`);
  return extractSession(response);
}

export const emaSpec = {
  schemaVersion: "1.0",
  name: "BTC EMA 5/10",
  description: "Test crossover",
  market: { venue: "indodax", marketType: "spot", symbol: "BTC/IDR", timeframe: "1h" },
  indicators: [
    { id: "fast", type: "ema", source: "close", period: 5 },
    { id: "slow", type: "ema", source: "close", period: 10 },
  ],
  entry: { operator: "crosses_above", left: { indicator: "fast" }, right: { indicator: "slow" } },
  exit: { operator: "crosses_below", left: { indicator: "fast" }, right: { indicator: "slow" } },
  risk: {
    positionSizing: { type: "percent_equity", value: 90 },
    stopLossPct: 5,
    takeProfitPct: null,
    maxOpenPositions: 1,
  },
};

export const demoConfig = {
  initialCapital: 10_000_000,
  startTime: "2025-01-01T00:00:00.000Z",
  endTime: "2025-01-15T00:00:00.000Z",
  feeRateBps: 20,
  slippageBps: 5,
  executionTiming: "next_candle_open",
};
