import { CONDITION_BOUNDS, TIMEFRAME_MS } from "@quantify/config";
import type { Candle, DataManifest } from "@quantify/market-data";
import type { BacktestSummary } from "@quantify/performance";
import type { StrategySpec } from "@quantify/strategy-spec";
import { z } from "zod";

export const backtestConfigSchema = z
  .object({
    initialCapital: z
      .number()
      .min(CONDITION_BOUNDS.initialCapital.min)
      .max(CONDITION_BOUNDS.initialCapital.max),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    feeRateBps: z
      .number()
      .min(CONDITION_BOUNDS.feeRateBps.min)
      .max(CONDITION_BOUNDS.feeRateBps.max),
    slippageBps: z
      .number()
      .min(CONDITION_BOUNDS.slippageBps.min)
      .max(CONDITION_BOUNDS.slippageBps.max),
    executionTiming: z.literal("next_candle_open"),
  })
  .strict();

export type BacktestConfig = z.infer<typeof backtestConfigSchema>;

export type Trade = {
  sequenceNumber: number;
  side: "long";
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  entryFee: number;
  exitFee: number;
  grossPnl: number;
  netPnl: number;
  returnPct: number;
  exitReason: "signal" | "stop_loss" | "take_profit" | "end_of_data";
};

export type EquityPoint = {
  timestamp: number;
  equity: number;
  drawdownPct: number;
};

export type BacktestAssumptions = {
  executionTiming: "next_candle_open";
  intrabarAssumption: "stop_first";
  feeRateBps: number;
  slippageBps: number;
  forceCloseAtEnd: true;
  longOnly: true;
  maxOpenPositions: 1;
};

export type BacktestOutput = {
  status: "COMPLETED";
  summary: BacktestSummary;
  trades: Trade[];
  equityCurve: EquityPoint[];
  warnings: string[];
  metadata: {
    engineVersion: string;
    schemaVersion: string;
    specHash: string;
    configHash: string;
    outputHash: string;
    dataManifest: DataManifest;
    assumptions: BacktestAssumptions;
    candleCount: number;
  };
};

export type BacktestInput = {
  spec: StrategySpec;
  candles: Candle[];
  config: BacktestConfig;
  dataManifest: DataManifest;
  engineVersion: string;
  extraWarnings?: string[];
};

export class EngineError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export function validateBacktestRequest(input: {
  config: BacktestConfig;
  candles: Candle[];
  spec: StrategySpec;
}): void {
  const { config, candles, spec } = input;
  const start = Date.parse(config.startTime);
  const end = Date.parse(config.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new EngineError(
      "The backtest end time must be after the start time.",
      "INVALID_DATE_RANGE",
    );
  }
  if (candles.length === 0) {
    throw new EngineError("No candles are available for this range.", "INSUFFICIENT_DATA");
  }
  for (const candle of candles) {
    if (candle.symbol !== spec.market.symbol || candle.timeframe !== spec.market.timeframe) {
      throw new EngineError("Candle market does not match the strategy market.", "MARKET_MISMATCH");
    }
    if (candle.timestamp < start || candle.timestamp + TIMEFRAME_MS[spec.market.timeframe] > end) {
      throw new EngineError(
        "Candles fall outside the requested backtest range.",
        "INVALID_DATE_RANGE",
      );
    }
  }
  if (candles.length < 2) {
    throw new EngineError("At least two complete candles are required.", "INSUFFICIENT_DATA");
  }
}
