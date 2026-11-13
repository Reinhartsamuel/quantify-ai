import { z } from "zod";

const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:3001"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1).default("postgres://quantify:quantify@localhost:5432/quantify"),
  DB_DRIVER: z.enum(["postgres", "pglite"]).default("postgres"),
  PGLITE_PATH: z.string().default("./.local/pglite"),
  SESSION_SECRET: z.string().min(16).default("dev-only-session-secret-change-me"),
  TRUSTED_ORIGINS: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: booleanish.default("false"),
  MARKET_DATA_MODE: z.enum(["indodax", "fixture"]).default("fixture"),
  MARKET_DATA_FIXTURE_DIR: z.string().default("./tests/fixtures/market-data/workshop"),
  AI_MODE: z.enum(["openai-compatible", "template"]).default("template"),
  AI_BASE_URL: z.string().default(""),
  AI_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default(""),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1_200),
  AI_DAILY_COST_CAP_USD: z.coerce.number().nonnegative().default(5),
  AI_INPUT_PRICE_PER_MTOK_USD: z.coerce.number().nonnegative().default(0.15),
  AI_OUTPUT_PRICE_PER_MTOK_USD: z.coerce.number().nonnegative().default(0.6),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  WORKER_INLINE: booleanish.default("false"),
  MAX_CANDLES: z.coerce.number().int().positive().default(20_000),
  BACKTEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  RATE_LIMIT_ENABLED: booleanish.default("true"),
  DATA_ADMIN_TOKEN: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

export function getConfig(): Env {
  if (!cached) cached = loadConfig();
  return cached;
}

export function resetConfigForTests(): void {
  cached = null;
}

export function trustedOrigins(env: Env = getConfig()): string[] {
  return env.TRUSTED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isProduction(env: Env = getConfig()): boolean {
  return env.APP_ENV === "production" || env.NODE_ENV === "production";
}
