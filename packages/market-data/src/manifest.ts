import { createHash } from "node:crypto";
import type { Candle, DataManifest } from "./types.js";

export function canonicalCandlesJson(candles: readonly Candle[]): string {
  const sorted = [...candles].sort((left, right) => left.timestamp - right.timestamp);
  return JSON.stringify(
    sorted.map((candle) => [
      candle.timestamp,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ]),
  );
}

export function hashCandles(candles: readonly Candle[]): string {
  return createHash("sha256").update(canonicalCandlesJson(candles)).digest("hex");
}

export function buildManifest(input: {
  provider: DataManifest["provider"];
  endpoint: string;
  candles: readonly Candle[];
  requestedFrom: number;
  requestedTo: number;
  fetchedAt?: string;
  gaps?: DataManifest["gaps"];
  maxGapCandles?: number;
  zeroVolumeCandles?: number;
}): DataManifest {
  if (input.candles.length === 0) throw new Error("Cannot build a manifest for zero candles");
  const first = input.candles[0] as Candle;
  return {
    provider: input.provider,
    endpoint: input.endpoint,
    symbol: first.symbol,
    timeframe: first.timeframe,
    requestedFrom: new Date(input.requestedFrom).toISOString(),
    requestedTo: new Date(input.requestedTo).toISOString(),
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    candleCount: input.candles.length,
    firstTimestamp: first.timestamp,
    lastTimestamp: input.candles.at(-1)?.timestamp ?? first.timestamp,
    sha256: hashCandles(input.candles),
    gaps: input.gaps ?? 0,
    maxGapCandles: input.maxGapCandles ?? 0,
    zeroVolumeCandles: input.zeroVolumeCandles ?? 0,
  };
}

export function hashObject(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortValue(entry)]),
    );
  }
  return value;
}
