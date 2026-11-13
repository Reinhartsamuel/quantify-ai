import { resolve } from "node:path";
import { hashPassword, hashToken } from "@quantify/auth";
import { processBacktestJob } from "@quantify/backtest-runner";
import { ENGINE_VERSION, loadConfig, WORKSHOP } from "@quantify/config";
import { createPgliteClient, createPostgresClient, Store } from "@quantify/db";
import { hashObject, MarketDataService } from "@quantify/market-data";
import { parseStrategySpec, TEMPLATES } from "@quantify/strategy-spec";

const env = loadConfig();
const client =
  env.DB_DRIVER === "pglite"
    ? await createPgliteClient(env.PGLITE_PATH === ":memory:" ? undefined : env.PGLITE_PATH)
    : createPostgresClient(env.DATABASE_URL);
const store = new Store(client);
await store.migrate();

const email = process.env.DEMO_EMAIL ?? "demo@quantify.local";
const password = process.env.DEMO_PASSWORD ?? "workshop-demo-2026";
const shareToken = process.env.DEMO_SHARE_TOKEN ?? "demo-share-token-2026";
const demoName = process.env.DEMO_NAME ?? "Workshop Demo";

let user = await store.findUserByEmail(email);
if (!user) {
  user = await store.createUser({
    email,
    passwordHash: hashPassword(password),
    name: demoName,
    isDemo: true,
  });
  console.log(`Created demo user ${email}`);
} else {
  console.log(`Demo user already exists: ${email}`);
}

const existing = await store.listStrategies({ userId: user.id, limit: 10 });
if (existing.length >= TEMPLATES.length) {
  console.log(
    `Seed already complete (${existing.length} strategies). Share token is unchanged if present.`,
  );
  await client.close();
  process.exit(0);
}

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

const created = [];
for (const template of TEMPLATES) {
  const parsed = parseStrategySpec(template.spec);
  if (!parsed.ok) throw new Error(`Template ${template.id} is invalid`);
  const strategy = await store.createStrategy({
    userId: user.id,
    name: template.name,
    description: template.description,
  });
  const version = await store.createVersion({
    strategyId: strategy.id,
    spec: parsed.spec,
    specHash: hashObject(parsed.spec),
    schemaVersion: "1.0",
    sourcePrompt: template.description,
    provider: "template",
    model: null,
  });
  created.push({ template, strategy, version });
  console.log(
    `Seeded template ${template.id} as strategy ${strategy.id} v${version.version_number}`,
  );
}

const demoEntry = created.find((item) => item.template.id === "rsi-mean-reversion") ?? created[0];
if (env.MARKET_DATA_MODE === "fixture" && demoEntry) {
  const { strategy, version } = demoEntry;
  const config = {
    initialCapital: 10_000_000,
    startTime: WORKSHOP.demoStartTime,
    endTime: "2025-07-01T00:00:00.000Z",
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
  if (inserted.existing) {
    console.log(`Known-good backtest already exists: ${inserted.job.id}`);
  } else {
    const result = await processBacktestJob(inserted.job.id, { store, marketData, env });
    if (result.status !== "completed") {
      throw new Error(`Known-good backtest failed: ${JSON.stringify(result)}`);
    }
    const job = await store.getBacktest(inserted.job.id);
    await store.createShare({
      jobId: inserted.job.id,
      tokenHash: hashToken(shareToken),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    console.log(`Known-good backtest: ${inserted.job.id}`);
    console.log(`Share link: ${env.APP_URL}/share/${shareToken}`);
    console.log(`Output hash: ${job?.output_hash}`);
    console.log(`Strategy: ${strategy.name} v${version.version_number}`);
  }
} else {
  console.log(
    "Snapshot mode is not fixture; skipped the known-good backtest. Run with MARKET_DATA_MODE=fixture.",
  );
}

await client.close();
console.log(`Demo credentials: ${email} / ${password}`);
