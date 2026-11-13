import { CONDITION_BOUNDS, SCHEMA_VERSION, SYMBOLS, TIMEFRAMES, VENUE } from "@quantify/config";
import { z } from "zod";

const priceSourceSchema = z.enum(["open", "high", "low", "close"]);

const emaIndicatorSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.literal("ema"),
    source: priceSourceSchema,
    period: z
      .number()
      .int()
      .min(CONDITION_BOUNDS.emaPeriod.min)
      .max(CONDITION_BOUNDS.emaPeriod.max),
  })
  .strict();

const smaIndicatorSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.literal("sma"),
    source: priceSourceSchema,
    period: z
      .number()
      .int()
      .min(CONDITION_BOUNDS.smaPeriod.min)
      .max(CONDITION_BOUNDS.smaPeriod.max),
  })
  .strict();

const rsiIndicatorSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.literal("rsi"),
    source: z.literal("close"),
    period: z
      .number()
      .int()
      .min(CONDITION_BOUNDS.rsiPeriod.min)
      .max(CONDITION_BOUNDS.rsiPeriod.max),
  })
  .strict();

const bollingerIndicatorSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.literal("bollinger"),
    source: z.literal("close"),
    period: z
      .number()
      .int()
      .min(CONDITION_BOUNDS.bollingerPeriod.min)
      .max(CONDITION_BOUNDS.bollingerPeriod.max),
    stdDev: z
      .number()
      .min(CONDITION_BOUNDS.bollingerStdDev.min)
      .max(CONDITION_BOUNDS.bollingerStdDev.max),
  })
  .strict();

export const indicatorSchema = z.discriminatedUnion("type", [
  emaIndicatorSchema,
  smaIndicatorSchema,
  rsiIndicatorSchema,
  bollingerIndicatorSchema,
]);

export const operandSchema = z.union([
  z.object({ price: priceSourceSchema }).strict(),
  z
    .object({
      indicator: z.string().min(1).max(40),
      output: z.enum(["value", "upper", "middle", "lower"]).optional(),
    })
    .strict(),
  z.object({ constant: z.number().finite() }).strict(),
]);

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | {
      operator: "greater_than" | "less_than" | "crosses_above" | "crosses_below";
      left: Operand;
      right: Operand;
    };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema).min(1).max(20) }).strict(),
    z.object({ any: z.array(conditionSchema).min(1).max(20) }).strict(),
    z
      .object({
        operator: z.enum(["greater_than", "less_than", "crosses_above", "crosses_below"]),
        left: operandSchema,
        right: operandSchema,
      })
      .strict(),
  ]),
);

export const marketSchema = z
  .object({
    venue: z.literal(VENUE),
    marketType: z.literal("spot"),
    symbol: z.enum(SYMBOLS),
    timeframe: z.enum(TIMEFRAMES),
  })
  .strict();

export const riskSchema = z
  .object({
    positionSizing: z
      .object({
        type: z.literal("percent_equity"),
        value: z
          .number()
          .min(CONDITION_BOUNDS.positionSizePct.min)
          .max(CONDITION_BOUNDS.positionSizePct.max),
      })
      .strict(),
    stopLossPct: z
      .number()
      .min(CONDITION_BOUNDS.stopLossPct.min)
      .max(CONDITION_BOUNDS.stopLossPct.max)
      .nullable(),
    takeProfitPct: z
      .number()
      .min(CONDITION_BOUNDS.takeProfitPct.min)
      .max(CONDITION_BOUNDS.takeProfitPct.max)
      .nullable(),
    maxOpenPositions: z.literal(1),
  })
  .strict();

export const strategySpecSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(1_000),
    market: marketSchema,
    indicators: z.array(indicatorSchema).max(10),
    entry: conditionSchema,
    exit: conditionSchema,
    risk: riskSchema,
  })
  .strict();

export type Indicator = z.infer<typeof indicatorSchema>;
export type Operand = z.infer<typeof operandSchema>;
export type Market = z.infer<typeof marketSchema>;
export type Risk = z.infer<typeof riskSchema>;
export type StrategySpec = z.infer<typeof strategySpecSchema>;

export type SpecIssue = {
  path: string;
  code: string;
  message: string;
};

export type SpecValidationResult = {
  valid: boolean;
  errors: SpecIssue[];
  warnings: SpecIssue[];
};

export type ParsedSpec =
  | { ok: true; spec: StrategySpec; validation: SpecValidationResult }
  | { ok: false; errors: SpecIssue[] };
