import { resolve } from "node:path";
import { GenerationService, OpenAICompatibleProvider } from "@quantify/ai";
import { AuthService } from "@quantify/auth";
import { processBacktestJob } from "@quantify/backtest-runner";
import { type Env, loadConfig } from "@quantify/config";
import { createPgliteClient, createPostgresClient, Store } from "@quantify/db";
import { type CandleCoverage, MarketDataService } from "@quantify/market-data";
import { createApp } from "./app.js";

export type Dependencies = Awaited<ReturnType<typeof createDependencies>>;

export async function createDependencies(env: Env = loadConfig()) {
  const client =
    env.DB_DRIVER === "pglite"
      ? await createPgliteClient(env.PGLITE_PATH === ":memory:" ? undefined : env.PGLITE_PATH)
      : createPostgresClient(env.DATABASE_URL);
  const store = new Store(client);
  await store.migrate();

  const cache = {
    readRange: (
      symbol: "BTC/IDR" | "ETH/IDR",
      timeframe: "1h" | "4h",
      fromMs: number,
      toMs: number,
    ) => store.readCandles(symbol, timeframe, fromMs, toMs),
    upsert: (candles: Parameters<Store["upsertCandles"]>[0]) => store.upsertCandles(candles),
    coverage: async (): Promise<CandleCoverage[]> => store.candleCoverage(),
  };

  const marketData = new MarketDataService({
    mode: env.MARKET_DATA_MODE,
    fixtureDirectory: resolve(env.MARKET_DATA_FIXTURE_DIR),
    cache,
  });

  const openai =
    env.AI_MODE === "openai-compatible" && env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL
      ? new OpenAICompatibleProvider({
          baseUrl: env.AI_BASE_URL,
          apiKey: env.AI_API_KEY,
          model: env.AI_MODEL,
          timeoutMs: env.AI_TIMEOUT_MS,
          maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
        })
      : undefined;
  const ai = new GenerationService({
    mode: env.AI_MODE,
    openai,
    inputPricePerMTokUsd: env.AI_INPUT_PRICE_PER_MTOK_USD,
    outputPricePerMTokUsd: env.AI_OUTPUT_PRICE_PER_MTOK_USD,
  });
  const auth = new AuthService(store, env);
  const logger = (level: "info" | "warn" | "error", message: string, meta?: unknown): void => {
    console.log(JSON.stringify({ level, type: "job", message, ...(meta as object) }));
  };
  const processJob = async (jobId: string) =>
    processBacktestJob(jobId, { store, marketData, env, logger });

  const app = createApp({
    store,
    auth,
    env,
    ai,
    marketData,
    processJob: env.WORKER_INLINE ? processJob : undefined,
  });

  return { env, client, store, auth, ai, marketData, app, processJob };
}
