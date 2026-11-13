import { CONDITION_BOUNDS, SYMBOLS, TIMEFRAMES, type VENUE } from "@quantify/config";
import { strategySpecSchema } from "@quantify/strategy-spec";
import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(200);

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const signInSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(200) })
  .strict();

export const generateRequestSchema = z
  .object({
    prompt: z.string().trim().min(8).max(4_000),
    symbol: z.enum(SYMBOLS),
    timeframe: z.enum(TIMEFRAMES),
  })
  .strict();

export const createStrategySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1_000).default(""),
  })
  .strict();

export const updateStrategySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1_000).optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .strict();

export const saveVersionSchema = z
  .object({
    spec: strategySpecSchema,
    sourcePrompt: z.string().max(4_000).optional(),
  })
  .strict();

export const backtestConfigContractSchema = z
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
    executionTiming: z.literal("next_candle_open").default("next_candle_open"),
  })
  .strict();

export const submitBacktestSchema = z
  .object({
    strategyVersionId: z.string().uuid(),
    config: backtestConfigContractSchema,
  })
  .strict();

export const paginationSchema = z
  .object({
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const equityQuerySchema = z
  .object({ maxPoints: z.coerce.number().int().min(100).max(5_000).default(2_000) })
  .strict();

export const symbolQuerySchema = z
  .object({ symbol: z.enum(SYMBOLS), timeframe: z.enum(TIMEFRAMES) })
  .strict();

export const shareRequestSchema = z
  .object({ expiresInDays: z.number().int().min(1).max(90).default(14) })
  .strict();

export const compareQuerySchema = z.object({ against: z.string().uuid() }).strict();

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "UNSUPPORTED_STRATEGY",
  "CLARIFICATION_REQUIRED",
  "MARKET_DATA_UNAVAILABLE",
  "INSUFFICIENT_DATA",
  "DATA_QUALITY_GAP",
  "BACKTEST_FAILED",
  "AI_PROVIDER_UNAVAILABLE",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiError = {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
    retryAfterSeconds?: number;
  };
};

export type Market = {
  venue: typeof VENUE;
  symbol: (typeof SYMBOLS)[number];
  timeframe: (typeof TIMEFRAMES)[number];
};

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  isDemo: boolean;
};

export type StrategyVersionDto = {
  id: string;
  strategyId: string;
  versionNumber: number;
  schemaVersion: string;
  spec: unknown;
  sourcePrompt: string | null;
  provider: string | null;
  model: string | null;
  createdAt: string;
};

export type StrategyDto = {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  symbol: Market["symbol"] | null;
  timeframe: Market["timeframe"] | null;
  latestVersionNumber: number | null;
  latestBacktestStatus: BacktestStatus | null;
  updatedAt: string;
  createdAt: string;
};

export type BacktestStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type BacktestSummaryDto = {
  initialCapital: number;
  endingEquity: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  winRatePct: number | null;
  totalTrades: number;
  profitFactor: number | null;
  averageTradeReturnPct: number | null;
};

export type BacktestJobDto = {
  id: string;
  strategyId: string;
  strategyName: string;
  strategyVersionId: string;
  versionNumber: number;
  status: BacktestStatus;
  config: unknown;
  summary: BacktestSummaryDto | null;
  warnings: string[];
  errorCode: string | null;
  errorMessage: string | null;
  dataManifest: unknown;
  outputHash: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type TradeDto = {
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
  exitReason: string;
};

export type EquityPointDto = { timestamp: number; equity: number; drawdownPct: number };

export type Paginated<T> = { items: T[]; nextCursor: string | null };
