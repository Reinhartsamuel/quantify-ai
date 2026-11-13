import { SCHEMA_VERSION } from "@quantify/config";
import type { GenerationResult, StrategySpec } from "@quantify/strategy-spec";
import type { GenerationInput, StrategyGenerationProvider } from "./provider.js";

const UNSUPPORTED_TERMS = [
  "short",
  "shorting",
  "leverage",
  "margin",
  "futures",
  "derivative",
  "options",
  "live trading",
  "real money",
  "place order",
  "withdraw",
  "binance",
  "bybit",
  "okx",
];

const INJECTION_TERMS = [
  "ignore previous",
  "ignore all previous",
  "system prompt",
  "developer message",
  "reveal your instructions",
  "execute code",
  "eval(",
];

function hasTerm(text: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, "i").test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numbersInRange(text: string, min: number, max: number): number[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value) && value >= min && value <= max);
}

function baseSpec(input: GenerationInput, name: string, description: string): StrategySpec {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    description,
    market: {
      venue: input.market.venue,
      marketType: "spot",
      symbol: input.market.symbol,
      timeframe: input.market.timeframe,
    },
    indicators: [],
    entry: { operator: "greater_than", left: { price: "close" }, right: { constant: 0 } },
    exit: { operator: "less_than", left: { price: "close" }, right: { constant: 0 } },
    risk: {
      positionSizing: { type: "percent_equity", value: 90 },
      stopLossPct: 5,
      takeProfitPct: null,
      maxOpenPositions: 1,
    },
  };
}

function emaResult(input: GenerationInput, prompt: string): GenerationResult {
  const numbers = numbersInRange(prompt, 2, 200);
  const fast = numbers[0] ?? 20;
  const slow = numbers[1] && numbers[1] > fast ? numbers[1] : 50;
  const assumptions = [
    numbers.length >= 2
      ? `Used EMA periods ${fast} and ${slow} from the description.`
      : `Assumed EMA periods ${fast} and ${slow} because the description did not specify both.`,
    "Assumed 90% of equity per position, a 5% stop loss, and no take profit.",
  ];
  const spec = baseSpec(
    input,
    `${input.market.symbol} EMA ${fast}/${slow} crossover`,
    `Long-only EMA crossover on ${input.market.symbol} ${input.market.timeframe}. Enter when EMA(${fast}) crosses above EMA(${slow}); exit when it crosses below.`,
  );
  spec.indicators = [
    { id: "ema_fast", type: "ema", source: "close", period: fast },
    { id: "ema_slow", type: "ema", source: "close", period: slow },
  ];
  spec.entry = {
    operator: "crosses_above",
    left: { indicator: "ema_fast" },
    right: { indicator: "ema_slow" },
  };
  spec.exit = {
    operator: "crosses_below",
    left: { indicator: "ema_fast" },
    right: { indicator: "ema_slow" },
  };
  return {
    status: "ok",
    spec,
    assumptions,
    explanation: `This strategy buys when the faster EMA (${fast}) rises above the slower EMA (${slow}), and sells when it falls back below. It is long-only and trades one position at a time.`,
    warnings: ["Crossover strategies can whipsaw in sideways markets."],
    provider: "template",
  };
}

function rsiResult(input: GenerationInput, prompt: string): GenerationResult {
  const numbers = numbersInRange(prompt, 0, 100);
  const periodCandidates = numbersInRange(prompt, 2, 50);
  const period = periodCandidates[0] ?? 14;
  const thresholds = numbers.filter((value) => value > 0 && value < 100 && value !== period);
  const oversoldRaw = thresholds[0] ?? 30;
  const overboughtRaw = thresholds[1] ?? 70;
  const oversold = Math.min(oversoldRaw, overboughtRaw);
  const overbought = Math.max(oversoldRaw, overboughtRaw);
  const assumptions = [
    `Used RSI period ${period}.`,
    `Assumed entry at RSI ${oversold} and exit at RSI ${overbought}.`,
    "Assumed 90% of equity per position with a 6% stop loss and 12% take profit.",
  ];
  const spec = baseSpec(
    input,
    `${input.market.symbol} RSI ${period} mean reversion`,
    `Long-only RSI mean reversion on ${input.market.symbol} ${input.market.timeframe}. Enter when RSI(${period}) crosses above ${oversold}; exit when RSI is above ${overbought}.`,
  );
  spec.indicators = [{ id: "rsi", type: "rsi", source: "close", period }];
  spec.entry = {
    operator: "crosses_above",
    left: { indicator: "rsi" },
    right: { constant: oversold },
  };
  spec.exit = {
    operator: "greater_than",
    left: { indicator: "rsi" },
    right: { constant: overbought },
  };
  spec.risk.stopLossPct = 6;
  spec.risk.takeProfitPct = 12;
  return {
    status: "ok",
    spec,
    assumptions,
    explanation: `This strategy buys when RSI(${period}) recovers above ${oversold} and exits when RSI is above ${overbought}. It buys weakness only after momentum turns up and holds one position.`,
    warnings: ["Mean reversion can fail during sustained downtrends."],
    provider: "template",
  };
}

function bollingerResult(input: GenerationInput, prompt: string): GenerationResult {
  const periodCandidates = numbersInRange(prompt, 5, 200);
  const period = periodCandidates[0] ?? 20;
  const stdDevCandidates = numbersInRange(prompt, 1, 3);
  const stdDev = stdDevCandidates[0] ?? 2;
  const assumptions = [
    `Used Bollinger period ${period} and ${stdDev} standard deviations.`,
    "Assumed entry when close crosses back above the lower band and exit when close crosses above the upper band.",
    "Assumed 90% of equity, a 7% stop loss, and a 14% take profit.",
  ];
  const spec = baseSpec(
    input,
    `${input.market.symbol} Bollinger ${period}/${stdDev} reversion`,
    `Long-only Bollinger band reversion on ${input.market.symbol} ${input.market.timeframe}. Enter when close crosses above the lower band; exit when close crosses above the upper band.`,
  );
  spec.indicators = [{ id: "bands", type: "bollinger", source: "close", period, stdDev }];
  spec.entry = {
    operator: "crosses_above",
    left: { price: "close" },
    right: { indicator: "bands", output: "lower" },
  };
  spec.exit = {
    operator: "crosses_above",
    left: { price: "close" },
    right: { indicator: "bands", output: "upper" },
  };
  spec.risk.stopLossPct = 7;
  spec.risk.takeProfitPct = 14;
  return {
    status: "ok",
    spec,
    assumptions,
    explanation: `This strategy buys when price closes back above the lower Bollinger band and exits when price closes above the upper band. It assumes volatility will revert toward the middle band.`,
    warnings: ["Band touches are not the same as closes; this rule waits for a close."],
    provider: "template",
  };
}

function smaResult(input: GenerationInput, prompt: string): GenerationResult {
  const numbers = numbersInRange(prompt, 2, 200);
  const fast = numbers[0] ?? 20;
  const slow = numbers[1] && numbers[1] > fast ? numbers[1] : 50;
  const spec = baseSpec(
    input,
    `${input.market.symbol} SMA ${fast}/${slow} crossover`,
    `Long-only SMA crossover on ${input.market.symbol} ${input.market.timeframe}. Enter when SMA(${fast}) crosses above SMA(${slow}); exit when it crosses below.`,
  );
  spec.indicators = [
    { id: "sma_fast", type: "sma", source: "close", period: fast },
    { id: "sma_slow", type: "sma", source: "close", period: slow },
  ];
  spec.entry = {
    operator: "crosses_above",
    left: { indicator: "sma_fast" },
    right: { indicator: "sma_slow" },
  };
  spec.exit = {
    operator: "crosses_below",
    left: { indicator: "sma_fast" },
    right: { indicator: "sma_slow" },
  };
  return {
    status: "ok",
    spec,
    assumptions: [
      `Used SMA periods ${fast} and ${slow}.`,
      "Assumed 90% of equity, a 5% stop loss, and no take profit.",
    ],
    explanation: `This strategy buys when the faster simple moving average rises above the slower one and exits on the reverse cross.`,
    warnings: ["Simple moving averages react more slowly than EMAs."],
    provider: "template",
  };
}

export class TemplateProvider implements StrategyGenerationProvider {
  readonly name = "template" as const;

  async generate(input: GenerationInput): Promise<GenerationResult> {
    const prompt = input.prompt.trim();
    if (prompt.length < 8) {
      return {
        status: "needs_clarification",
        questions: [
          "Which indicator should the strategy use: EMA, SMA, RSI, or Bollinger bands?",
          "What should trigger the entry, and what should trigger the exit?",
        ],
        provider: "template",
      };
    }

    const lower = prompt.toLowerCase();
    for (const term of UNSUPPORTED_TERMS) {
      if (hasTerm(lower, term)) {
        return {
          status: "unsupported",
          explanation: `This workshop version supports long-only spot strategies on BTC/IDR and ETH/IDR. It cannot simulate ${term}.`,
          provider: "template",
        };
      }
    }

    const injected = INJECTION_TERMS.some((term) => lower.includes(term));
    const hasEma = /\bema\b|exponential moving average/.test(lower);
    const hasSma = /\bsma\b|simple moving average/.test(lower);
    const hasRsi = /\brsi\b|relative strength|oversold|overbought/.test(lower);
    const hasBollinger = /bollinger|standard deviation|bands?/.test(lower);
    const hasCross = /cross|above|below|momentum|trend/.test(lower);

    if (injected && !hasEma && !hasSma && !hasRsi && !hasBollinger) {
      return {
        status: "unsupported",
        explanation:
          "The description asks for behavior outside the supported strategy schema. Describe entry and exit rules using EMA, SMA, RSI, or Bollinger bands.",
        provider: "template",
      };
    }

    if (hasBollinger) return bollingerResult(input, prompt);
    if (hasRsi) return rsiResult(input, prompt);
    if (hasEma) return emaResult(input, prompt);
    if (hasSma) return smaResult(input, prompt);
    if (hasCross && /price/.test(lower)) {
      return {
        status: "needs_clarification",
        questions: [
          "Which indicator should confirm the price cross: EMA, SMA, RSI, or Bollinger bands?",
          "What exact price level or indicator value should trigger the exit?",
        ],
        provider: "template",
      };
    }

    return {
      status: "needs_clarification",
      questions: [
        "Which indicator should the strategy use: EMA, SMA, RSI, or Bollinger bands?",
        "What should trigger the entry?",
        "What should trigger the exit?",
      ],
      assumptions: [],
      provider: "template",
    };
  }
}
