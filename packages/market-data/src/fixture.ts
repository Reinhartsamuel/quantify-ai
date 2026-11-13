import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { INDODAX_SYMBOL, type Symbol, TIMEFRAME_MS, type Timeframe } from "@quantify/config";
import { type CandleRequest, MarketDataError, type MarketDataProvider } from "./indodax.js";
import type { Candle } from "./types.js";
import { trimCandles } from "./validation.js";

type SnapshotCandle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export class FixtureProvider implements MarketDataProvider {
  private readonly cache = new Map<string, Candle[]>();

  constructor(readonly directory: string) {}

  async fetchCandles(request: CandleRequest): Promise<Candle[]> {
    const all = this.load(request.symbol, request.timeframe);
    const candles = trimCandles(all, request.fromMs, request.toMs, request.timeframe);
    if (candles.length === 0) {
      throw new MarketDataError(
        "MARKET_DATA_UNAVAILABLE",
        `The workshop snapshot has no candles for ${request.symbol} ${request.timeframe} in the requested range.`,
      );
    }
    const first = all[0] as Candle;
    const last = all.at(-1) as Candle;
    if (
      request.fromMs < first.timestamp ||
      request.toMs > last.timestamp + TIMEFRAME_MS[request.timeframe]
    ) {
      throw new MarketDataError(
        "MARKET_DATA_UNAVAILABLE",
        `The workshop snapshot covers ${new Date(first.timestamp).toISOString()} to ${new Date(last.timestamp).toISOString()}. Choose a range inside the snapshot.`,
      );
    }
    return candles;
  }

  coverage(): Array<{
    symbol: Symbol;
    timeframe: Timeframe;
    firstTimestamp: number;
    lastTimestamp: number;
    candleCount: number;
  }> {
    const result: Array<{
      symbol: Symbol;
      timeframe: Timeframe;
      firstTimestamp: number;
      lastTimestamp: number;
      candleCount: number;
    }> = [];
    for (const symbol of ["BTC/IDR", "ETH/IDR"] as const) {
      for (const timeframe of ["1h", "4h"] as const) {
        try {
          const candles = this.load(symbol, timeframe);
          if (candles.length > 0) {
            result.push({
              symbol,
              timeframe,
              firstTimestamp: candles[0]?.timestamp ?? 0,
              lastTimestamp: candles.at(-1)?.timestamp ?? 0,
              candleCount: candles.length,
            });
          }
        } catch {
          // Missing fixture is reported by health as no coverage.
        }
      }
    }
    return result;
  }

  private load(symbol: Symbol, timeframe: Timeframe): Candle[] {
    const key = `${symbol}:${timeframe}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const base = join(this.directory, `${INDODAX_SYMBOL[symbol]}-${timeframe}`);
    const gzipPath = `${base}.json.gz`;
    const plainPath = `${base}.json`;
    if (!existsSync(gzipPath) && !existsSync(plainPath)) {
      throw new MarketDataError(
        "MARKET_DATA_UNAVAILABLE",
        `Workshop snapshot file is missing for ${symbol} ${timeframe}. Run bun run data:prefetch.`,
      );
    }
    let text: string;
    if (existsSync(gzipPath)) {
      text = gunzipSync(readFileSync(gzipPath)).toString("utf8");
    } else {
      text = readFileSync(plainPath, "utf8");
    }
    const raw = JSON.parse(text) as unknown;
    if (!Array.isArray(raw)) {
      throw new MarketDataError(
        "INVALID_RESPONSE",
        `Snapshot for ${symbol} ${timeframe} is not an array.`,
      );
    }
    const candles: Candle[] = raw.map((entry) => {
      const item = entry as SnapshotCandle;
      return {
        venue: "indodax" as const,
        symbol,
        timeframe,
        timestamp: Number(item.t),
        open: Number(item.o),
        high: Number(item.h),
        low: Number(item.l),
        close: Number(item.c),
        volume: Number(item.v),
      };
    });
    candles.sort((left, right) => left.timestamp - right.timestamp);
    this.cache.set(key, candles);
    return candles;
  }
}
