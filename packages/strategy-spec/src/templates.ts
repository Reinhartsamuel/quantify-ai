import { SCHEMA_VERSION, WORKSHOP } from "@quantify/config";
import type { StrategySpec } from "./schema.js";

export type StrategyTemplate = {
  id: string;
  name: string;
  description: string;
  teaches: string;
  spec: StrategySpec;
};

const baseMarket = {
  venue: "indodax",
  marketType: "spot",
  symbol: WORKSHOP.defaultSymbol,
  timeframe: WORKSHOP.defaultTimeframe,
} as const;

export const TEMPLATES: StrategyTemplate[] = [
  {
    id: "ema-crossover",
    name: "EMA crossover",
    description:
      "Follow medium-term momentum: buy when the 20-period EMA crosses above the 50-period EMA, and exit when it crosses back below.",
    teaches: "Trend following, crossover signals, and why lagging indicators can whipsaw.",
    spec: {
      schemaVersion: SCHEMA_VERSION,
      name: "BTC EMA 20/50 crossover",
      description:
        "Long-only trend strategy on BTC/IDR 1h. Enter when EMA(20) crosses above EMA(50); exit when it crosses below.",
      market: baseMarket,
      indicators: [
        { id: "ema_fast", type: "ema", source: "close", period: 20 },
        { id: "ema_slow", type: "ema", source: "close", period: 50 },
      ],
      entry: {
        operator: "crosses_above",
        left: { indicator: "ema_fast" },
        right: { indicator: "ema_slow" },
      },
      exit: {
        operator: "crosses_below",
        left: { indicator: "ema_fast" },
        right: { indicator: "ema_slow" },
      },
      risk: {
        positionSizing: { type: "percent_equity", value: 95 },
        stopLossPct: 5,
        takeProfitPct: null,
        maxOpenPositions: 1,
      },
    },
  },
  {
    id: "rsi-mean-reversion",
    name: "RSI mean reversion",
    description:
      "Buy when RSI(14) recovers from oversold territory (crosses above 30) and exit when RSI reaches overbought territory (above 70).",
    teaches: "Mean reversion, oscillator thresholds, and buying weakness versus buying strength.",
    spec: {
      schemaVersion: SCHEMA_VERSION,
      name: "BTC RSI 14 mean reversion",
      description:
        "Long-only mean-reversion strategy on BTC/IDR 1h. Enter when RSI(14) crosses above 30; exit when RSI(14) is above 70.",
      market: baseMarket,
      indicators: [{ id: "rsi_14", type: "rsi", source: "close", period: 14 }],
      entry: {
        operator: "crosses_above",
        left: { indicator: "rsi_14" },
        right: { constant: 30 },
      },
      exit: {
        operator: "greater_than",
        left: { indicator: "rsi_14" },
        right: { constant: 70 },
      },
      risk: {
        positionSizing: { type: "percent_equity", value: 90 },
        stopLossPct: 6,
        takeProfitPct: 12,
        maxOpenPositions: 1,
      },
    },
  },
  {
    id: "bollinger-reversion",
    name: "Bollinger band reversion",
    description:
      "Buy when price closes back above the lower Bollinger band (20, 2σ) and exit when price closes above the upper band.",
    teaches:
      "Volatility bands, standard deviation, and the difference between a touch and a close.",
    spec: {
      schemaVersion: SCHEMA_VERSION,
      name: "BTC Bollinger reversion",
      description:
        "Long-only Bollinger band strategy on BTC/IDR 1h. Enter when close crosses above the lower band; exit when close crosses above the upper band.",
      market: baseMarket,
      indicators: [{ id: "bands", type: "bollinger", source: "close", period: 20, stdDev: 2 }],
      entry: {
        operator: "crosses_above",
        left: { price: "close" },
        right: { indicator: "bands", output: "lower" },
      },
      exit: {
        operator: "crosses_above",
        left: { price: "close" },
        right: { indicator: "bands", output: "upper" },
      },
      risk: {
        positionSizing: { type: "percent_equity", value: 90 },
        stopLossPct: 7,
        takeProfitPct: 14,
        maxOpenPositions: 1,
      },
    },
  },
];

export function getTemplate(id: string): StrategyTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
