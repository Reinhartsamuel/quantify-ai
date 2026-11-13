import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  SYMBOLS,
  type Symbol,
  TIMEFRAMES,
  type Timeframe,
  WORKSHOP,
} from "../packages/config/src/index.ts";
import { buildManifest, trimCandles, validateCandles } from "../packages/market-data/src/index.ts";
import type { Candle } from "../packages/market-data/src/types.ts";

const directory = resolve(process.env.SNAPSHOT_DIR ?? "tests/fixtures/market-data/workshop");
const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as {
  generatedAt: string;
  workshopRange: { from: string; to: string };
  series: Array<{
    symbol: Symbol;
    timeframe: Timeframe;
    file: string;
    sha256: string;
    candleCount: number;
    firstTimestamp: number;
    lastTimestamp: number;
    gaps: number;
    maxGapCandles: number;
    zeroVolumeCandles: number;
  }>;
};

const fromMs = Date.parse(manifest.workshopRange.from || WORKSHOP.startTime);
const toMs = Date.parse(manifest.workshopRange.to || WORKSHOP.endTime);
let failures = 0;
console.log(`Snapshot: ${directory}`);
console.log(`Generated: ${manifest.generatedAt}`);
console.log(`Range: ${new Date(fromMs).toISOString()} → ${new Date(toMs).toISOString()}\n`);
console.log(
  "symbol      tf   count   first                last                 gaps maxGap zeroVol  hash",
);
for (const symbol of SYMBOLS as readonly Symbol[]) {
  for (const timeframe of TIMEFRAMES as readonly Timeframe[]) {
    const entry = manifest.series.find(
      (item) => item.symbol === symbol && item.timeframe === timeframe,
    );
    if (!entry) {
      console.error(`MISSING ${symbol} ${timeframe}`);
      failures += 1;
      continue;
    }
    const raw = JSON.parse(
      gunzipSync(readFileSync(join(directory, entry.file))).toString("utf8"),
    ) as Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
    const candles: Candle[] = raw.map((item) => ({
      venue: "indodax",
      symbol,
      timeframe,
      timestamp: item.t,
      open: item.o,
      high: item.h,
      low: item.l,
      close: item.c,
      volume: item.v,
    }));
    const trimmed = trimCandles(candles, fromMs, toMs, timeframe);
    const validation = validateCandles(trimmed, timeframe, { allowGaps: true });
    const rebuilt = buildManifest({
      provider: "indodax",
      endpoint: "https://indodax.com/tradingview/history_v2",
      candles: trimmed,
      requestedFrom: fromMs,
      requestedTo: toMs,
      fetchedAt: manifest.generatedAt,
      gaps: validation.gaps.length,
      maxGapCandles: validation.maxGapCandles,
      zeroVolumeCandles: validation.zeroVolumeCandles,
    });
    const hashOk = rebuilt.sha256 === entry.sha256;
    const countOk = trimmed.length === entry.candleCount;
    const firstOk = rebuilt.firstTimestamp === entry.firstTimestamp;
    const lastOk = rebuilt.lastTimestamp === entry.lastTimestamp;
    const ok = hashOk && countOk && firstOk && lastOk && validation.valid;
    if (!ok) failures += 1;
    console.log(
      `${symbol.padEnd(11)} ${timeframe.padEnd(4)} ${String(trimmed.length).padStart(6)}  ${new Date(
        rebuilt.firstTimestamp,
      ).toISOString()}  ${new Date(rebuilt.lastTimestamp).toISOString()}  ${String(
        validation.gaps.length,
      ).padStart(4)} ${String(validation.maxGapCandles).padStart(6)} ${String(
        validation.zeroVolumeCandles,
      ).padStart(7)}  ${rebuilt.sha256.slice(0, 12)}${ok ? "" : "  FAIL"}`,
    );
    if (!ok) {
      console.error({
        hashOk,
        countOk,
        firstOk,
        lastOk,
        valid: validation.valid,
        errors: validation.errors,
      });
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} snapshot check(s) failed.`);
  process.exit(1);
}
console.log(
  "\nSnapshot verified: counts, timestamps, gaps, zero-volume, and SHA-256 match the manifest.",
);
