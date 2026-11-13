import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  INDODAX_SYMBOL,
  SYMBOLS,
  type Symbol,
  TIMEFRAMES,
  type Timeframe,
  WORKSHOP,
} from "../packages/config/src/index.ts";
import {
  buildManifest,
  IndodaxProvider,
  trimCandles,
  validateCandles,
} from "../packages/market-data/src/index.ts";
import type { Candle } from "../packages/market-data/src/types.ts";

const fromMs = Date.parse(process.env.WORKSHOP_FROM ?? WORKSHOP.startTime);
const toMs = Date.parse(process.env.WORKSHOP_TO ?? WORKSHOP.endTime);
const directory = resolve(process.env.SNAPSHOT_DIR ?? "tests/fixtures/market-data/workshop");
mkdirSync(directory, { recursive: true });

const provider = new IndodaxProvider({ requestsPerSecond: 1.5 });
const entries: Array<Record<string, unknown>> = [];
const fetchedAt = new Date().toISOString();

for (const symbol of SYMBOLS as readonly Symbol[]) {
  for (const timeframe of TIMEFRAMES as readonly Timeframe[]) {
    process.stdout.write(
      `Fetching ${symbol} ${timeframe} ${new Date(fromMs).toISOString()} → ${new Date(toMs).toISOString()} ... `,
    );
    const started = Date.now();
    const raw = await provider.fetchCandles({ symbol, timeframe, fromMs, toMs });
    const candles = trimCandles(raw, fromMs, toMs, timeframe);
    const validation = validateCandles(candles, timeframe, { allowGaps: true });
    if (candles.length < 100)
      throw new Error(`Too few candles for ${symbol} ${timeframe}: ${candles.length}`);
    const manifest = buildManifest({
      provider: "indodax",
      endpoint: "https://indodax.com/tradingview/history_v2",
      candles,
      requestedFrom: fromMs,
      requestedTo: toMs,
      fetchedAt,
      gaps: validation.gaps.length,
      maxGapCandles: validation.maxGapCandles,
      zeroVolumeCandles: validation.zeroVolumeCandles,
    });
    const fileBase = `${INDODAX_SYMBOL[symbol]}-${timeframe}`;
    const compact = candles.map((candle: Candle) => ({
      t: candle.timestamp,
      o: candle.open,
      h: candle.high,
      l: candle.low,
      c: candle.close,
      v: candle.volume,
    }));
    writeFileSync(
      join(directory, `${fileBase}.json.gz`),
      gzipSync(JSON.stringify(compact), { level: 9 }),
    );
    entries.push({
      file: `${fileBase}.json.gz`,
      ...manifest,
      gapDetails: validation.gaps,
      ohlcViolations: validation.ohlcViolations.length,
      duplicates: validation.duplicates.length,
      validationErrors: validation.errors,
      fetchLatencyMs: Date.now() - started,
      uncompressedBytes: JSON.stringify(compact).length,
    });
    console.log(
      `${candles.length} candles, gaps=${validation.gaps.length}, maxGap=${validation.maxGapCandles}, zeroVolume=${validation.zeroVolumeCandles}, ${Date.now() - started}ms`,
    );
  }
}

writeFileSync(
  join(directory, "manifest.json"),
  JSON.stringify(
    {
      version: 1,
      generatedAt: fetchedAt,
      provider: "indodax",
      endpoint: "https://indodax.com/tradingview/history_v2",
      workshopRange: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
      series: entries,
    },
    null,
    2,
  ),
);
console.log(`Wrote snapshot manifest to ${join(directory, "manifest.json")}`);
