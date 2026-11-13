import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Symbol, TIMEFRAME_MS, type Timeframe } from "@quantify/config";
import { FixtureProvider } from "./fixture.js";
import {
  type CandleRequest,
  IndodaxProvider,
  MarketDataError,
  type MarketDataProvider,
} from "./indodax.js";
import { buildManifest } from "./manifest.js";
import type { Candle, DataManifest } from "./types.js";
import { trimCandles, validateCandles } from "./validation.js";

export type CandleCoverage = {
  symbol: Symbol;
  timeframe: Timeframe;
  firstTimestamp: number;
  lastTimestamp: number;
  candleCount: number;
};

export interface CandleCache {
  readRange(symbol: Symbol, timeframe: Timeframe, fromMs: number, toMs: number): Promise<Candle[]>;
  upsert(candles: readonly Candle[]): Promise<void>;
  coverage(): Promise<CandleCoverage[]>;
}

export type MarketDataResult = {
  candles: Candle[];
  manifest: DataManifest;
  warnings: string[];
};

export type MarketDataServiceOptions = {
  mode: "indodax" | "fixture";
  fixtureDirectory: string;
  cache?: CandleCache;
  provider?: MarketDataProvider;
  fetchedAt?: string;
};

export class MarketDataService {
  private readonly mode: "indodax" | "fixture";
  private readonly provider: MarketDataProvider;
  private readonly cache: CandleCache | undefined;
  private readonly fetchedAt: string | undefined;
  private readonly fixtureDirectory: string;

  constructor(options: MarketDataServiceOptions) {
    this.mode = options.mode;
    this.fixtureDirectory = options.fixtureDirectory;
    this.provider =
      options.provider ??
      (options.mode === "fixture"
        ? new FixtureProvider(options.fixtureDirectory)
        : new IndodaxProvider());
    this.cache = options.cache;
    this.fetchedAt =
      options.fetchedAt ??
      (options.mode === "fixture" ? snapshotGeneratedAt(options.fixtureDirectory) : undefined);
  }

  async getCandles(request: CandleRequest): Promise<MarketDataResult> {
    const requested = {
      ...request,
      fromMs: alignStart(request.fromMs, request.timeframe),
      toMs: alignEnd(request.toMs, request.timeframe),
    };
    let raw: Candle[];

    if (this.mode === "fixture") {
      raw = await this.provider.fetchCandles(requested);
    } else if (this.cache) {
      const cached = await this.cache.readRange(
        request.symbol,
        request.timeframe,
        requested.fromMs,
        requested.toMs + TIMEFRAME_MS[request.timeframe],
      );
      const expected = expectedCandleCount(requested.fromMs, requested.toMs, request.timeframe);
      const first = cached[0]?.timestamp ?? Number.POSITIVE_INFINITY;
      const last = cached.at(-1)?.timestamp ?? 0;
      const coversStart = first <= requested.fromMs;
      const coversEnd = last >= requested.toMs - TIMEFRAME_MS[request.timeframe];
      if (cached.length >= expected * 0.98 && coversStart && coversEnd) {
        raw = cached;
      } else {
        const fetched = await this.provider.fetchCandles(requested);
        await this.cache.upsert(fetched);
        raw = await this.cache.readRange(
          request.symbol,
          request.timeframe,
          requested.fromMs,
          requested.toMs + TIMEFRAME_MS[request.timeframe],
        );
      }
    } else {
      raw = await this.provider.fetchCandles(requested);
    }

    const candles = trimCandles(raw, requested.fromMs, requested.toMs, request.timeframe);
    if (candles.length === 0) {
      throw new MarketDataError(
        "NO_DATA",
        "No complete candles exist for this range. Adjust the dates.",
      );
    }
    const validation = validateCandles(candles, request.timeframe);
    if (!validation.valid) {
      const gapFailure = validation.errors.some(
        (error) => error.includes("gap") || error.includes("Missing candles"),
      );
      throw new MarketDataError(
        gapFailure ? "DATA_QUALITY_GAP" : "MARKET_DATA_UNAVAILABLE",
        validation.errors[0] ?? "Market data failed validation.",
      );
    }
    const manifest = buildManifest({
      provider: this.mode === "fixture" ? "fixture" : "indodax",
      endpoint:
        this.mode === "fixture"
          ? "fixture://workshop-snapshot"
          : "https://indodax.com/tradingview/history_v2",
      candles,
      requestedFrom: requested.fromMs,
      requestedTo: requested.toMs,
      fetchedAt: this.fetchedAt,
      gaps: validation.gaps.length,
      maxGapCandles: validation.maxGapCandles,
      zeroVolumeCandles: validation.zeroVolumeCandles,
    });

    return {
      candles,
      manifest,
      warnings: validation.warnings,
    };
  }

  async coverage(): Promise<CandleCoverage[]> {
    if (this.mode === "fixture") {
      return new FixtureProvider(this.fixtureDirectory).coverage();
    }
    if (this.cache) return this.cache.coverage();
    return [];
  }
}

function snapshotGeneratedAt(directory: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as {
      generatedAt?: string;
    };
    return manifest.generatedAt;
  } catch {
    return undefined;
  }
}

export function alignStart(fromMs: number, timeframe: Timeframe): number {
  const spacing = TIMEFRAME_MS[timeframe];
  return Math.ceil(fromMs / spacing) * spacing;
}

export function alignEnd(toMs: number, timeframe: Timeframe): number {
  const spacing = TIMEFRAME_MS[timeframe];
  return Math.floor(toMs / spacing) * spacing;
}

export function expectedCandleCount(fromMs: number, toMs: number, timeframe: Timeframe): number {
  const spacing = TIMEFRAME_MS[timeframe];
  return Math.floor((toMs - fromMs) / spacing) + 1;
}
