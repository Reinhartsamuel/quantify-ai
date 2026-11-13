export const SCHEMA_VERSION = "1.0" as const;
export const ENGINE_VERSION = "1.0.0" as const;
export const VENUE = "indodax" as const;

export const SYMBOLS = ["BTC/IDR", "ETH/IDR"] as const;
export type Symbol = (typeof SYMBOLS)[number];

export const TIMEFRAMES = ["1h", "4h"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
};

export const INDODAX_SYMBOL: Record<Symbol, string> = {
  "BTC/IDR": "BTCIDR",
  "ETH/IDR": "ETHIDR",
};

export const INDODAX_TIMEFRAME: Record<Timeframe, string> = {
  "1h": "60",
  "4h": "240",
};

export const DEFAULT_FEE_RATE_BPS = 20;
export const DEFAULT_SLIPPAGE_BPS = 5;
export const DEFAULT_INITIAL_CAPITAL = 10_000_000;

export const LIMITS = {
  maxCandles: 20_000,
  maxPromptChars: 4_000,
  maxBodyBytes: 256 * 1024,
  smallBodyBytes: 64 * 1024,
  maxTradesPage: 100,
  maxStrategiesPage: 50,
  maxEquityPoints: 2_000,
  generationPerHour: 5,
  generationPerDay: 20,
  backtestsPerHour: 10,
  backtestsPerDay: 50,
  globalGenerationPerHour: 200,
  globalBacktestsPerHour: 300,
  authAttemptsPer15Min: 20,
  backtestTimeoutMs: 60_000,
  workerConcurrency: 2,
  maxConcurrentJobsPerUser: 1,
  aiTimeoutMs: 20_000,
  aiMaxOutputTokens: 1_200,
  aiMaxPromptChars: 4_000,
  shareLinkTtlDays: 14,
  sessionTtlDays: 14,
} as const;

export const CONDITION_BOUNDS = {
  maxDepth: 3,
  maxNodes: 20,
  emaPeriod: { min: 2, max: 200 },
  smaPeriod: { min: 2, max: 200 },
  rsiPeriod: { min: 2, max: 50 },
  bollingerPeriod: { min: 5, max: 200 },
  bollingerStdDev: { min: 1, max: 3 },
  rsiThreshold: { min: 0, max: 100 },
  positionSizePct: { min: 1, max: 100 },
  stopLossPct: { min: 0.1, max: 50 },
  takeProfitPct: { min: 0.1, max: 100 },
  initialCapital: { min: 100_000, max: 10_000_000_000 },
  feeRateBps: { min: 0, max: 500 },
  slippageBps: { min: 0, max: 200 },
} as const;

export const GAP_POLICY = {
  maxGapCandles: 24,
  maxGapFraction: 0.1,
} as const;

export const WORKSHOP = {
  defaultSymbol: "BTC/IDR" as const,
  defaultTimeframe: "1h" as const,
  startTime: "2025-01-01T00:00:00.000Z",
  endTime: "2026-06-30T00:00:00.000Z",
  demoStartTime: "2025-01-01T00:00:00.000Z",
  demoEndTime: "2025-12-31T23:59:59.999Z",
  cohortSize: 30,
  headroomMultiplier: 1.5,
  expectedConcurrency: 45,
} as const;

export const DATA_MANIFEST_PROVIDER = "indodax" as const;
export const INDODAX_BASE_URL = "https://indodax.com";
export const INDODAX_HISTORY_PATH = "/tradingview/history_v2";

export const SIMULATION_DISCLOSURE =
  "Simulated historical result. Not investment advice. Past performance does not predict future results.";
