import type { Candle } from "@quantify/market-data";
import { hashObject } from "@quantify/market-data";
import { summarize } from "@quantify/performance";
import { compileStrategy } from "@quantify/strategy-compiler";
import type { StrategySpec } from "@quantify/strategy-spec";
import {
  type BacktestConfig,
  type BacktestInput,
  type BacktestOutput,
  backtestConfigSchema,
  EngineError,
  type EquityPoint,
  type Trade,
  validateBacktestRequest,
} from "./types.js";

type Position = {
  quantity: number;
  entryPrice: number;
  entryFee: number;
  entryTimestamp: number;
  notional: number;
};

type Pending = { action: "entry" | "exit"; signalIndex: number };

export function runBacktest(input: BacktestInput): BacktestOutput {
  const parsedConfig = backtestConfigSchema.safeParse(input.config);
  if (!parsedConfig.success) {
    throw new EngineError(
      parsedConfig.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
      "VALIDATION_FAILED",
    );
  }
  const config = parsedConfig.data;
  const candles = [...input.candles].sort((left, right) => left.timestamp - right.timestamp);
  validateBacktestRequest({ config, candles, spec: input.spec });

  const compiled = compileStrategy(input.spec, candles);
  const feeRate = config.feeRateBps / 10_000;
  const slippage = config.slippageBps / 10_000;
  const sizingPct = input.spec.risk.positionSizing.value / 100;
  const stopPct = input.spec.risk.stopLossPct;
  const takePct = input.spec.risk.takeProfitPct;

  let cash = config.initialCapital;
  let position: Position | null = null;
  let pending: Pending | null = null;
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];
  const warnings = [...(input.extraWarnings ?? [])];

  if (input.dataManifest.gaps > 0) {
    warnings.push(
      `${input.dataManifest.gaps} gap(s) in the data; missing candles were not filled.`,
    );
  }
  if (candles.length < compiled.warmupBars + 2) {
    warnings.push(
      `The range has ${candles.length} candles but the longest indicator needs ${compiled.warmupBars}. No signals may fire.`,
    );
  }

  const firstTimestamp = candles[0]?.timestamp ?? 0;
  const spacing = candles.length > 1 ? (candles[1] as Candle).timestamp - firstTimestamp : 0;
  let peak = config.initialCapital;
  let equity = config.initialCapital;
  equityCurve.push({ timestamp: firstTimestamp - spacing, equity, drawdownPct: 0 });

  let sequence = 0;

  const closePosition = (
    basePrice: number,
    timestamp: number,
    reason: Trade["exitReason"],
  ): void => {
    if (!position) return;
    const exitPrice = basePrice * (1 - slippage);
    const proceeds = exitPrice * position.quantity;
    const exitFee = proceeds * feeRate;
    cash += proceeds - exitFee;
    const grossPnl = (exitPrice - position.entryPrice) * position.quantity;
    const netPnl = grossPnl - position.entryFee - exitFee;
    sequence += 1;
    trades.push({
      sequenceNumber: sequence,
      side: "long",
      entryTime: new Date(position.entryTimestamp).toISOString(),
      exitTime: new Date(timestamp).toISOString(),
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      entryFee: position.entryFee,
      exitFee,
      grossPnl,
      netPnl,
      returnPct: position.notional > 0 ? (netPnl / position.notional) * 100 : 0,
      exitReason: reason,
    });
    position = null;
  };

  const openPosition = (openPrice: number, timestamp: number): void => {
    if (position) return;
    const entryPrice = openPrice * (1 + slippage);
    const availableEquity = cash;
    const targetNotional = availableEquity * sizingPct;
    const affordableNotional = cash / (1 + feeRate);
    const notional = Math.min(targetNotional, affordableNotional);
    if (!(notional > 0) || !(entryPrice > 0)) return;
    const quantity = notional / entryPrice;
    if (!(quantity > 0)) return;
    const entryFee = notional * feeRate;
    cash -= notional + entryFee;
    position = {
      quantity,
      entryPrice,
      entryFee,
      entryTimestamp: timestamp,
      notional,
    };
  };

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index] as Candle;
    const isLast = index === candles.length - 1;

    if (pending && index > pending.signalIndex) {
      const action = pending.action;
      pending = null;
      if (action === "entry" && !position) openPosition(candle.open, candle.timestamp);
      else if (action === "exit" && position)
        closePosition(candle.open, candle.timestamp, "signal");
    }

    if (position) {
      const current = position as Position;
      const stopPrice = stopPct === null ? null : current.entryPrice * (1 - stopPct / 100);
      const takePrice = takePct === null ? null : current.entryPrice * (1 + takePct / 100);
      if (stopPrice !== null && candle.open <= stopPrice) {
        closePosition(candle.open, candle.timestamp, "stop_loss");
      } else if (takePrice !== null && candle.open >= takePrice) {
        closePosition(candle.open, candle.timestamp, "take_profit");
      } else if (stopPrice !== null && candle.low <= stopPrice) {
        closePosition(stopPrice, candle.timestamp, "stop_loss");
      } else if (takePrice !== null && candle.high >= takePrice) {
        closePosition(takePrice, candle.timestamp, "take_profit");
      }
    }

    if (!isLast) {
      const entrySignal = compiled.evaluateEntry(index);
      const exitSignal = compiled.evaluateExit(index);
      if (position && exitSignal) pending = { action: "exit", signalIndex: index };
      else if (!position && entrySignal) pending = { action: "entry", signalIndex: index };
    }

    if (isLast && position) {
      closePosition(candle.close, candle.timestamp, "end_of_data");
    }

    const marked = position as Position | null;
    equity = cash + (marked ? marked.quantity * candle.close : 0);
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    const point: EquityPoint = { timestamp: candle.timestamp, equity, drawdownPct: drawdown };
    if (equityCurve.length > 0 && equityCurve.at(-1)?.timestamp === candle.timestamp) {
      equityCurve[equityCurve.length - 1] = point;
    } else {
      equityCurve.push(point);
    }
  }

  if (position) {
    const last = candles.at(-1) as Candle;
    closePosition(last.close, last.timestamp, "end_of_data");
    equity = cash;
  }

  const summary = summarize({
    initialCapital: config.initialCapital,
    endingEquity: equity,
    equityPoints: equityCurve,
    trades: trades.map((trade) => ({
      netPnl: trade.netPnl,
      entryNotional: trade.entryPrice * trade.quantity,
    })),
  });

  const metadataBase = {
    engineVersion: input.engineVersion,
    schemaVersion: input.spec.schemaVersion,
    specHash: hashObject(input.spec),
    configHash: hashObject(config),
    dataManifest: input.dataManifest,
    assumptions: {
      executionTiming: config.executionTiming,
      intrabarAssumption: "stop_first",
      feeRateBps: config.feeRateBps,
      slippageBps: config.slippageBps,
      forceCloseAtEnd: true,
      longOnly: true,
      maxOpenPositions: 1,
    } as const,
    candleCount: candles.length,
  };
  const outputHash = hashObject({
    summary,
    trades,
    equityCurve,
    metadata: metadataBase,
  });

  return {
    status: "COMPLETED",
    summary,
    trades,
    equityCurve,
    warnings,
    metadata: { ...metadataBase, outputHash },
  };
}

export function configHash(config: BacktestConfig): string {
  return hashObject(config);
}

export function specHash(spec: StrategySpec): string {
  return hashObject(spec);
}
