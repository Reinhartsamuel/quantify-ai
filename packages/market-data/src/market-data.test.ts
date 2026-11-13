import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildManifest,
  type Candle,
  FixtureProvider,
  hashCandles,
  IndodaxProvider,
  trimCandles,
  validateCandles,
} from "./index.js";

const START = Date.parse("2025-01-01T00:00:00.000Z");
const HOUR = 3_600_000;

function candle(overrides: Partial<Candle> = {}): Candle {
  return {
    venue: "indodax",
    symbol: "BTC/IDR",
    timeframe: "1h",
    timestamp: START,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 10,
    ...overrides,
  };
}

function series(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) =>
    candle({
      timestamp: START + index * HOUR,
      open: 100 + index,
      close: 101 + index,
      high: 102 + index,
      low: 99 + index,
    }),
  );
}

describe("candle validation", () => {
  it("accepts a clean series", () => {
    const result = validateCandles(series(24), "1h");
    expect(result.valid).toBe(true);
    expect(result.gaps).toHaveLength(0);
  });

  it("rejects duplicates and non-monotonic timestamps", () => {
    const bad = series(4);
    bad.push({ ...bad[2]! });
    const result = validateCandles(bad, "1h");
    expect(result.valid).toBe(false);
    expect(result.duplicates.length).toBeGreaterThan(0);
  });

  it("rejects OHLC violations", () => {
    const bad = [candle({ high: 90, low: 110 })];
    const result = validateCandles(bad, "1h");
    expect(result.valid).toBe(false);
    expect(result.ohlcViolations).toHaveLength(1);
  });

  it("detects a gap and fails when it exceeds the policy", () => {
    const bad = [candle(), candle({ timestamp: START + 30 * HOUR })];
    const result = validateCandles(bad, "1h");
    expect(result.gaps).toHaveLength(1);
    expect(result.maxGapCandles).toBe(29);
    expect(result.valid).toBe(false);
  });

  it("warns on zero-volume candles but keeps them", () => {
    const result = validateCandles(
      [candle({ volume: 0 }), candle({ timestamp: START + HOUR })],
      "1h",
    );
    expect(result.zeroVolumeCandles).toBe(1);
    expect(result.warnings.join(" ")).toContain("zero volume");
    expect(result.valid).toBe(true);
  });

  it("trims before the range and excludes a partial final candle", () => {
    const trimmed = trimCandles(series(6), START + HOUR, START + 5 * HOUR, "1h");
    expect(trimmed.map((item) => item.timestamp)).toEqual([
      START + HOUR,
      START + 2 * HOUR,
      START + 3 * HOUR,
      START + 4 * HOUR,
    ]);
  });
});

describe("data manifests", () => {
  it("produces a stable hash for the same candles regardless of order", () => {
    const forward = series(10);
    const reversed = [...forward].reverse();
    expect(hashCandles(forward)).toBe(hashCandles(reversed));
    expect(hashCandles(forward)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("records count, range, gaps, and zero volume", () => {
    const manifest = buildManifest({
      provider: "fixture",
      endpoint: "fixture://test",
      candles: series(10),
      requestedFrom: START,
      requestedTo: START + 10 * HOUR,
      fetchedAt: "2025-01-01T00:00:00.000Z",
      gaps: 1,
      maxGapCandles: 3,
      zeroVolumeCandles: 2,
    });
    expect(manifest.candleCount).toBe(10);
    expect(manifest.firstTimestamp).toBe(START);
    expect(manifest.gaps).toBe(1);
    expect(manifest.zeroVolumeCandles).toBe(2);
  });
});

describe("fixture provider", () => {
  it("reads a gzipped snapshot and trims the range", async () => {
    const directory = mkdtempSync(join(tmpdir(), "quantify-fixture-provider-"));
    const data = series(48).map((item) => ({
      t: item.timestamp,
      o: item.open,
      h: item.high,
      l: item.low,
      c: item.close,
      v: item.volume,
    }));
    writeFileSync(join(directory, "BTCIDR-1h.json"), JSON.stringify(data));
    const provider = new FixtureProvider(directory);
    const candles = await provider.fetchCandles({
      symbol: "BTC/IDR",
      timeframe: "1h",
      fromMs: START + 10 * HOUR,
      toMs: START + 20 * HOUR,
    });
    expect(candles).toHaveLength(10);
    expect(candles[0]?.timestamp).toBe(START + 10 * HOUR);
    expect(provider.coverage()[0]?.candleCount).toBe(48);
  });

  it("fails clearly when the range is outside the snapshot", async () => {
    const directory = mkdtempSync(join(tmpdir(), "quantify-fixture-provider-"));
    writeFileSync(
      join(directory, "BTCIDR-1h.json"),
      JSON.stringify(
        series(5).map((item) => ({
          t: item.timestamp,
          o: item.open,
          h: item.high,
          l: item.low,
          c: item.close,
          v: item.volume,
        })),
      ),
    );
    const provider = new FixtureProvider(directory);
    await expect(
      provider.fetchCandles({
        symbol: "BTC/IDR",
        timeframe: "1h",
        fromMs: START + 100 * HOUR,
        toMs: START + 120 * HOUR,
      }),
    ).rejects.toMatchObject({ code: "MARKET_DATA_UNAVAILABLE" });
  });
});

describe("Indodax adapter", () => {
  it("normalizes the provider payload and paginates under the row cap", async () => {
    let calls = 0;
    const fetchImpl = (async (url: URL | RequestInfo) => {
      calls += 1;
      const parsed = new URL(String(url));
      const from = Number(parsed.searchParams.get("from"));
      const to = Number(parsed.searchParams.get("to"));
      const rows: Array<Record<string, string | number>> = [];
      for (let time = from; time <= to; time += 3600) {
        rows.push({
          Time: time,
          Open: 100,
          High: 110,
          Low: 90,
          Close: 105,
          Volume: "1.5",
        });
      }
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const provider = new IndodaxProvider({
      fetchImpl,
      requestsPerSecond: 1000,
      maxRetries: 0,
    });
    const candles = await provider.fetchCandles({
      symbol: "BTC/IDR",
      timeframe: "1h",
      fromMs: START,
      toMs: START + 2_000 * HOUR,
    });
    expect(calls).toBeGreaterThan(1);
    expect(candles.length).toBeGreaterThan(1_900);
    expect(candles[0]?.venue).toBe("indodax");
    expect(candles[0]?.volume).toBe(1.5);
  });

  it("maps 429 to a retryable rate-limit error", async () => {
    const fetchImpl = (async () =>
      new Response("slow down", {
        status: 429,
        headers: { "retry-after": "0" },
      })) as typeof fetch;
    const provider = new IndodaxProvider({
      fetchImpl,
      requestsPerSecond: 1000,
      maxRetries: 1,
    });
    await expect(
      provider.fetchCandles({
        symbol: "BTC/IDR",
        timeframe: "1h",
        fromMs: START,
        toMs: START + HOUR,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true });
  });
});
