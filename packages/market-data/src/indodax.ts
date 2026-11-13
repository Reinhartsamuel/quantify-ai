import {
  INDODAX_BASE_URL,
  INDODAX_HISTORY_PATH,
  INDODAX_SYMBOL,
  INDODAX_TIMEFRAME,
  type Symbol,
  TIMEFRAME_MS,
  type Timeframe,
} from "@quantify/config";
import type { Candle } from "./types.js";

export type MarketDataErrorCode =
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "NO_DATA"
  | "INVALID_RESPONSE"
  | "MARKET_DATA_UNAVAILABLE"
  | "DATA_QUALITY_GAP";

export class MarketDataError extends Error {
  readonly code: MarketDataErrorCode;
  readonly retryable: boolean;
  constructor(code: MarketDataErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "MarketDataError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type CandleRequest = {
  symbol: Symbol;
  timeframe: Timeframe;
  fromMs: number;
  toMs: number;
};

export interface MarketDataProvider {
  fetchCandles(request: CandleRequest): Promise<Candle[]>;
}

const YEAR_SECONDS = 365 * 24 * 60 * 60;

class RateLimiter {
  private nextAt = 0;
  constructor(private readonly minimumIntervalMs: number) {}
  async wait(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAt - now);
    this.nextAt = Math.max(now, this.nextAt) + this.minimumIntervalMs;
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

type RawCandle = {
  Time: number | string;
  Open: number | string;
  High: number | string;
  Low: number | string;
  Close: number | string;
  Volume: number | string;
};

export type IndodaxProviderOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  requestsPerSecond?: number;
};

export class IndodaxProvider implements MarketDataProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly limiter: RateLimiter;

  constructor(options: IndodaxProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? INDODAX_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.limiter = new RateLimiter(1000 / (options.requestsPerSecond ?? 2));
  }

  async fetchCandles(request: CandleRequest): Promise<Candle[]> {
    const fromSeconds = Math.floor(request.fromMs / 1000);
    const toSeconds = Math.ceil(request.toMs / 1000);
    const spacingSeconds = TIMEFRAME_MS[request.timeframe] / 1000;
    const chunkSeconds = Math.min(YEAR_SECONDS, 600 * spacingSeconds);
    const chunks: Array<{ from: number; to: number }> = [];
    for (let cursor = fromSeconds; cursor < toSeconds; cursor += chunkSeconds) {
      chunks.push({ from: cursor, to: Math.min(cursor + chunkSeconds - 1, toSeconds) });
    }
    const byTimestamp = new Map<number, Candle>();
    for (const chunk of chunks) {
      const candles = await this.fetchChunk(
        request.symbol,
        request.timeframe,
        chunk.from,
        chunk.to,
      );
      for (const candle of candles) byTimestamp.set(candle.timestamp, candle);
    }
    if (byTimestamp.size === 0) {
      throw new MarketDataError("NO_DATA", "Indodax returned no candles for the requested range.");
    }
    return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
  }

  private async fetchChunk(
    symbol: Symbol,
    timeframe: Timeframe,
    from: number,
    to: number,
  ): Promise<Candle[]> {
    const url = new URL(INDODAX_HISTORY_PATH, this.baseUrl);
    url.searchParams.set("from", String(from));
    url.searchParams.set("to", String(to));
    url.searchParams.set("symbol", INDODAX_SYMBOL[symbol]);
    url.searchParams.set("tf", INDODAX_TIMEFRAME[timeframe]);

    let lastError: MarketDataError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.limiter.wait();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, { signal: controller.signal });
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "1");
          lastError = new MarketDataError(
            "RATE_LIMITED",
            "Indodax rate limit reached. Retrying shortly.",
            true,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(500, retryAfter * 1000) * (attempt + 1)),
          );
          continue;
        }
        if (response.status >= 500) {
          lastError = new MarketDataError(
            "PROVIDER_UNAVAILABLE",
            "Indodax is temporarily unavailable.",
            true,
          );
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
          continue;
        }
        if (!response.ok) {
          throw new MarketDataError(
            "PROVIDER_UNAVAILABLE",
            `Indodax rejected the request (HTTP ${response.status}).`,
            response.status >= 500,
          );
        }
        const payload = (await response.json()) as unknown;
        return this.normalize(payload, symbol, timeframe, from);
      } catch (error) {
        if (error instanceof MarketDataError) {
          lastError = error;
          if (!error.retryable) throw error;
        } else {
          lastError = new MarketDataError(
            "PROVIDER_UNAVAILABLE",
            error instanceof Error && error.name === "AbortError"
              ? "Indodax request timed out."
              : "Could not reach Indodax.",
            true,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new MarketDataError("PROVIDER_UNAVAILABLE", "Indodax request failed.");
  }

  private normalize(
    payload: unknown,
    symbol: Symbol,
    timeframe: Timeframe,
    from: number,
  ): Candle[] {
    if (!Array.isArray(payload)) {
      throw new MarketDataError("INVALID_RESPONSE", "Indodax returned an unexpected payload.");
    }
    return payload
      .map((entry): Candle | null => {
        if (!entry || typeof entry !== "object") return null;
        const raw = entry as RawCandle;
        const time = Number(raw.Time);
        const open = Number(raw.Open);
        const high = Number(raw.High);
        const low = Number(raw.Low);
        const close = Number(raw.Close);
        const volume = Number(raw.Volume);
        if (
          !Number.isFinite(time) ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close) ||
          !Number.isFinite(volume)
        ) {
          return null;
        }
        if (time < from) return null;
        return {
          venue: "indodax",
          symbol,
          timeframe,
          timestamp: time * 1000,
          open,
          high,
          low,
          close,
          volume,
        };
      })
      .filter((candle): candle is Candle => candle !== null)
      .sort((left, right) => left.timestamp - right.timestamp);
  }
}
