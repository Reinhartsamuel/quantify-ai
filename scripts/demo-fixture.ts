import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runBacktest } from "@quantify/backtest-engine";
import { ENGINE_VERSION, loadConfig, WORKSHOP } from "@quantify/config";
import {
  buildManifest,
  FixtureProvider,
  hashCandles,
  hashObject,
  IndodaxProvider,
  trimCandles,
  validateCandles,
} from "@quantify/market-data";
import { parseStrategySpec, TEMPLATES } from "@quantify/strategy-spec";
import { writeEvidence } from "./evidence.js";

const env = loadConfig();
const fixtureDir = resolve(env.MARKET_DATA_FIXTURE_DIR);
const withLive = process.argv.includes("--live");
const symbol = "BTC/IDR" as const;
const timeframe = "1h" as const;
const fromMs = Date.parse(WORKSHOP.demoStartTime);
const toMs = Date.parse("2025-07-01T00:00:00.000Z");
const config = {
  initialCapital: 10_000_000,
  startTime: new Date(fromMs).toISOString(),
  endTime: new Date(toMs).toISOString(),
  feeRateBps: 20,
  slippageBps: 5,
  executionTiming: "next_candle_open" as const,
};
const template = TEMPLATES.find((item) => item.id === "rsi-mean-reversion") ?? TEMPLATES[0];
if (!template) throw new Error("No template found");
const parsed = parseStrategySpec(template.spec);
if (!parsed.ok) throw new Error("Template invalid");
const spec = parsed.spec;

const snapshotManifest = JSON.parse(readFileSync(join(fixtureDir, "manifest.json"), "utf8")) as {
  generatedAt: string;
};

function fixtureCandles() {
  return new FixtureProvider(fixtureDir).fetchCandles({ symbol, timeframe, fromMs, toMs });
}

function buildResult(
  candles: Awaited<ReturnType<typeof fixtureCandles>>,
  provider: "fixture" | "indodax",
  fetchedAt: string,
) {
  const trimmed = trimCandles(candles, fromMs, toMs, timeframe);
  const validation = validateCandles(trimmed, timeframe);
  const manifest = buildManifest({
    provider,
    endpoint:
      provider === "fixture"
        ? "fixture://workshop-snapshot"
        : "https://indodax.com/tradingview/history_v2",
    candles: trimmed,
    requestedFrom: fromMs,
    requestedTo: toMs,
    fetchedAt,
    gaps: validation.gaps.length,
    maxGapCandles: validation.maxGapCandles,
    zeroVolumeCandles: validation.zeroVolumeCandles,
  });
  const output = runBacktest({
    spec,
    candles: trimmed,
    config,
    dataManifest: manifest,
    engineVersion: ENGINE_VERSION,
  });
  return {
    manifest,
    output,
    contentHash: hashObject({
      summary: output.summary,
      trades: output.trades,
      equityCurve: output.equityCurve,
    }),
  };
}

console.log(`Demo fixture check: ${template.name} on ${symbol} ${timeframe}`);
const fixture = buildResult(await fixtureCandles(), "fixture", snapshotManifest.generatedAt);
const fixtureAgain = buildResult(await fixtureCandles(), "fixture", snapshotManifest.generatedAt);
if (fixture.contentHash !== fixtureAgain.contentHash)
  throw new Error("Fixture output is not deterministic");
console.log(
  `Fixture candles: ${fixture.manifest.candleCount}, hash ${hashCandles(await fixtureCandles()).slice(0, 16)}`,
);
console.log(
  `Fixture demo return: ${fixture.output.summary.netReturnPct.toFixed(2)}%, trades ${fixture.output.summary.totalTrades}`,
);
console.log(`Fixture content hash: ${fixture.contentHash}`);

let liveComparison:
  | {
      ran: true;
      candleHash: string;
      contentHash: string;
      identicalCandles: boolean;
      identicalOutput: boolean;
      liveReturnPct: number;
    }
  | { ran: false; reason: string } = {
  ran: false,
  reason: "run with --live to compare against Indodax",
};

if (withLive) {
  try {
    const live = await new IndodaxProvider({ requestsPerSecond: 1.5 }).fetchCandles({
      symbol,
      timeframe,
      fromMs,
      toMs,
    });
    const liveBuilt = buildResult(live, "indodax", new Date().toISOString());
    const identicalCandles =
      hashCandles(trimCandles(live, fromMs, toMs, timeframe)) ===
      hashCandles(await fixtureCandles());
    liveComparison = {
      ran: true,
      candleHash: hashCandles(trimCandles(live, fromMs, toMs, timeframe)),
      contentHash: liveBuilt.contentHash,
      identicalCandles,
      identicalOutput: liveBuilt.contentHash === fixture.contentHash,
      liveReturnPct: liveBuilt.output.summary.netReturnPct,
    };
    console.log(
      `Live candles identical: ${identicalCandles}; live output identical: ${liveBuilt.contentHash === fixture.contentHash}`,
    );
    console.log(`Live demo return: ${liveBuilt.output.summary.netReturnPct.toFixed(2)}%`);
  } catch (error) {
    liveComparison = {
      ran: false,
      reason: error instanceof Error ? error.message : "live fetch failed",
    };
    console.warn(`Live comparison skipped: ${liveComparison.reason}`);
  }
}

const evidence = {
  generatedAt: new Date().toISOString(),
  template: template.id,
  strategy: template.spec.name,
  symbol,
  timeframe,
  range: { from: config.startTime, to: config.endTime },
  config,
  fixture: {
    candleCount: fixture.manifest.candleCount,
    candleHash: fixture.manifest.sha256,
    manifest: fixture.manifest,
    summary: fixture.output.summary,
    trades: fixture.output.trades.length,
    contentHash: fixture.contentHash,
    outputHash: fixture.output.metadata.outputHash,
    deterministic: fixture.contentHash === fixtureAgain.contentHash,
  },
  live: liveComparison,
  identicalOutput: liveComparison.ran ? liveComparison.identicalOutput : null,
  expected: {
    netReturnPct: fixture.output.summary.netReturnPct,
    maxDrawdownPct: fixture.output.summary.maxDrawdownPct,
    totalTrades: fixture.output.summary.totalTrades,
    endingEquity: fixture.output.summary.endingEquity,
  },
};
writeEvidence("demo-fixture.json", evidence);
