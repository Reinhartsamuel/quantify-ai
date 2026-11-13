import { buildManifest, type Candle } from "@quantify/market-data";
import { describe, expect, it } from "vitest";
import { runBacktest } from "./index.js";
import type { BacktestConfig } from "./types.js";

const START = Date.parse("2025-01-01T00:00:00.000Z");
const HOUR = 3_600_000;

function candles(closes: number[], lows?: number[], highs?: number[]): Candle[] {
  return closes.map((close, index) => {
    const open = index === 0 ? close : (closes[index - 1] as number);
    return {
      venue: "indodax" as const,
      symbol: "BTC/IDR" as const,
      timeframe: "1h" as const,
      timestamp: START + index * HOUR,
      open,
      high: highs?.[index] ?? Math.max(open, close) + 1,
      low: lows?.[index] ?? Math.min(open, close) - 1,
      close,
      volume: 10,
    };
  });
}

function manifest(series: Candle[]) {
  return buildManifest({
    provider: "fixture",
    endpoint: "fixture://test",
    candles: series,
    requestedFrom: START,
    requestedTo: START + series.length * HOUR,
    fetchedAt: "2025-01-01T00:00:00.000Z",
  });
}

function config(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    initialCapital: 1_000_000,
    startTime: "2025-01-01T00:00:00.000Z",
    endTime: new Date(START + 6 * HOUR).toISOString(),
    feeRateBps: 10,
    slippageBps: 5,
    executionTiming: "next_candle_open",
    ...overrides,
  };
}

const entryOnly = {
  schemaVersion: "1.0" as const,
  name: "Entry test",
  description: "Enter above 100, exit below -1 (never).",
  market: {
    venue: "indodax" as const,
    marketType: "spot" as const,
    symbol: "BTC/IDR" as const,
    timeframe: "1h" as const,
  },
  indicators: [],
  entry: {
    operator: "greater_than" as const,
    left: { price: "close" as const },
    right: { constant: 100 },
  },
  exit: {
    operator: "less_than" as const,
    left: { price: "close" as const },
    right: { constant: -1 },
  },
  risk: {
    positionSizing: { type: "percent_equity" as const, value: 100 },
    stopLossPct: null,
    takeProfitPct: null,
    maxOpenPositions: 1 as const,
  },
};

const roundTrip = {
  ...entryOnly,
  name: "Round trip",
  exit: {
    operator: "less_than" as const,
    left: { price: "close" as const },
    right: { constant: 100 },
  },
};

describe("deterministic backtest engine", () => {
  it("fills at the next candle open with fees and slippage", () => {
    const series = candles([100, 101, 102, 103, 99, 98]);
    const output = runBacktest({
      spec: roundTrip,
      candles: series,
      config: config(),
      dataManifest: manifest(series),
      engineVersion: "1.0.0",
    });
    expect(output.summary.totalTrades).toBe(1);
    const trade = output.trades[0]!;
    expect(trade.entryTime).toBe(new Date(START + 2 * HOUR).toISOString());
    expect(trade.exitTime).toBe(new Date(START + 5 * HOUR).toISOString());
    expect(trade.entryPrice).toBeCloseTo(101 * 1.0005);
    expect(trade.exitPrice).toBeCloseTo(99 * 0.9995);
    expect(trade.exitReason).toBe("signal");
    const expectedNotional = 1_000_000 / 1.001;
    expect(trade.quantity).toBeCloseTo(expectedNotional / (101 * 1.0005));
    expect(trade.entryFee).toBeCloseTo(expectedNotional * 0.001);
    expect(output.summary.endingEquity).toBeCloseTo(trade.quantity * 99 * 0.9995 * (1 - 0.001));
  });

  it("force-closes an open position at the final close", () => {
    const series = candles([100, 101, 102, 105]);
    const output = runBacktest({
      spec: entryOnly,
      candles: series,
      config: config({ endTime: new Date(START + 4 * HOUR).toISOString() }),
      dataManifest: manifest(series),
      engineVersion: "1.0.0",
    });
    expect(output.trades).toHaveLength(1);
    expect(output.trades[0]?.exitReason).toBe("end_of_data");
    expect(output.trades[0]?.exitTime).toBe(new Date(START + 3 * HOUR).toISOString());
    expect(output.trades[0]?.exitPrice).toBeCloseTo(105 * 0.9995);
  });

  it("applies a stop loss intrabar and records the reason", () => {
    const series = candles([100, 101, 102, 103], [99, 100, 94, 100]);
    const spec = { ...entryOnly, risk: { ...entryOnly.risk, stopLossPct: 5 } };
    const output = runBacktest({
      spec,
      candles: series,
      config: config({ endTime: new Date(START + 4 * HOUR).toISOString() }),
      dataManifest: manifest(series),
      engineVersion: "1.0.0",
    });
    const trade = output.trades[0]!;
    expect(trade.exitReason).toBe("stop_loss");
    expect(trade.exitPrice).toBeCloseTo(101 * 1.0005 * 0.95 * 0.9995);
  });

  it("applies a take profit intrabar and records the reason", () => {
    const series = candles([100, 101, 102, 103], [99, 100, 100, 100], [101, 102, 110, 104]);
    const spec = { ...entryOnly, risk: { ...entryOnly.risk, takeProfitPct: 5 } };
    const output = runBacktest({
      spec,
      candles: series,
      config: config({ endTime: new Date(START + 4 * HOUR).toISOString() }),
      dataManifest: manifest(series),
      engineVersion: "1.0.0",
    });
    const trade = output.trades[0]!;
    expect(trade.exitReason).toBe("take_profit");
    expect(trade.exitPrice).toBeCloseTo(101 * 1.0005 * 1.05 * 0.9995);
  });

  it("gives stop loss precedence when both levels are touched", () => {
    const series = candles([100, 101, 102, 103], [99, 100, 80, 100], [101, 102, 120, 104]);
    const spec = {
      ...entryOnly,
      risk: { ...entryOnly.risk, stopLossPct: 5, takeProfitPct: 5 },
    };
    const output = runBacktest({
      spec,
      candles: series,
      config: config({ endTime: new Date(START + 4 * HOUR).toISOString() }),
      dataManifest: manifest(series),
      engineVersion: "1.0.0",
    });
    expect(output.trades[0]?.exitReason).toBe("stop_loss");
    expect(output.metadata.assumptions.intrabarAssumption).toBe("stop_first");
  });

  it("does not look ahead when future candles change", () => {
    const original = candles([100, 101, 102, 103, 99, 98, 97, 96]);
    const mutated = candles([100, 101, 102, 103, 99, 120, 80, 200]);
    const first = runBacktest({
      spec: roundTrip,
      candles: original,
      config: config({ endTime: new Date(START + 8 * HOUR).toISOString() }),
      dataManifest: manifest(original),
      engineVersion: "1.0.0",
    });
    const second = runBacktest({
      spec: roundTrip,
      candles: mutated,
      config: config({ endTime: new Date(START + 8 * HOUR).toISOString() }),
      dataManifest: manifest(mutated),
      engineVersion: "1.0.0",
    });
    const cutoff = START + 4 * HOUR;
    const firstPoints = first.equityCurve.filter((point) => point.timestamp <= cutoff);
    const secondPoints = second.equityCurve.filter((point) => point.timestamp <= cutoff);
    expect(secondPoints).toEqual(firstPoints);
    expect(second.trades.filter((trade) => Date.parse(trade.entryTime) <= cutoff)).toEqual(
      first.trades.filter((trade) => Date.parse(trade.entryTime) <= cutoff),
    );
  });

  it("is bit-for-bit deterministic for identical inputs", () => {
    const series = candles([100, 101, 102, 103, 99, 98]);
    const input = {
      spec: roundTrip,
      candles: series,
      config: config(),
      dataManifest: manifest(series),
      engineVersion: "1.0.0" as const,
    };
    const first = runBacktest(input);
    const second = runBacktest(input);
    expect(second.metadata.outputHash).toBe(first.metadata.outputHash);
    expect(second.trades).toEqual(first.trades);
    expect(second.equityCurve).toEqual(first.equityCurve);
  });

  it("never opens overlapping positions", () => {
    const series = candles([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
    const output = runBacktest({
      spec: entryOnly,
      candles: series,
      config: config({ endTime: new Date(START + 10 * HOUR).toISOString() }),
      dataManifest: manifest(series),
      engineVersion: "1.0.0",
    });
    for (let index = 1; index < output.trades.length; index += 1) {
      expect(Date.parse(output.trades[index]!.entryTime)).toBeGreaterThanOrEqual(
        Date.parse(output.trades[index - 1]!.exitTime),
      );
    }
    for (const trade of output.trades) {
      expect(trade.quantity).toBeGreaterThan(0);
      expect(trade.entryFee).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(trade.netPnl)).toBe(true);
    }
  });
});
