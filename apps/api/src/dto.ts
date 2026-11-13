import { type BacktestConfig, configHash as computeConfigHash } from "@quantify/backtest-engine";
import { type Env, LIMITS, WORKSHOP } from "@quantify/config";
import type {
  BacktestJobDto,
  BacktestSummaryDto,
  StrategyDto,
  StrategyVersionDto,
  TradeDto,
} from "@quantify/contracts";
import type { BacktestJobRecord, Store, StrategyRecord, StrategyVersionRecord } from "@quantify/db";
import type { CandleCoverage } from "@quantify/market-data";

export function num(value: unknown): number {
  return Number(value ?? 0);
}

export function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function strategyDto(row: StrategyRecord): StrategyDto {
  const spec = row.latest_spec_json as { market?: { symbol?: string; timeframe?: string } } | null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    symbol: (spec?.market?.symbol as StrategyDto["symbol"]) ?? null,
    timeframe: (spec?.market?.timeframe as StrategyDto["timeframe"]) ?? null,
    latestVersionNumber:
      row.latest_version_number === null ? null : Number(row.latest_version_number),
    latestBacktestStatus:
      (row.latest_backtest_status as StrategyDto["latestBacktestStatus"]) ?? null,
    updatedAt: iso(row.updated_at),
    createdAt: iso(row.created_at),
  };
}

export function versionDto(row: StrategyVersionRecord): StrategyVersionDto {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    versionNumber: Number(row.version_number),
    schemaVersion: row.schema_version,
    spec: row.spec_json,
    sourcePrompt: row.source_prompt,
    provider: row.generation_provider,
    model: row.generation_model,
    createdAt: iso(row.created_at),
  };
}

export function backtestDto(row: BacktestJobRecord): BacktestJobDto {
  const summary = row.summary_json as BacktestSummaryDto | null;
  return {
    id: row.id,
    strategyId: String(row.strategy_id ?? ""),
    strategyName: String(row.strategy_name ?? ""),
    strategyVersionId: row.strategy_version_id,
    versionNumber: Number(row.version_number ?? 0),
    status: row.status,
    config: row.config_json,
    summary: summary ?? null,
    warnings: Array.isArray(row.warnings_json) ? (row.warnings_json as string[]) : [],
    errorCode: row.error_code,
    errorMessage: row.error_message_safe,
    dataManifest: row.data_manifest_json,
    outputHash: row.output_hash,
    createdAt: iso(row.created_at),
    startedAt: row.started_at ? iso(row.started_at) : null,
    completedAt: row.completed_at ? iso(row.completed_at) : null,
  };
}

export function tradeDto(row: Record<string, unknown>): TradeDto {
  return {
    sequenceNumber: Number(row.sequence_number),
    side: "long",
    entryTime: iso(row.entry_time),
    exitTime: iso(row.exit_time),
    entryPrice: num(row.entry_price),
    exitPrice: num(row.exit_price),
    quantity: num(row.quantity),
    entryFee: num(row.entry_fee),
    exitFee: num(row.exit_fee),
    grossPnl: num(row.gross_pnl),
    netPnl: num(row.net_pnl),
    returnPct: num(row.return_pct),
    exitReason: String(row.exit_reason),
  };
}

export function validateBacktestRange(
  config: BacktestConfig,
  timeframe: "1h" | "4h",
  maxCandles: number,
): { ok: true; expected: number } | { ok: false; message: string } {
  const start = Date.parse(config.startTime);
  const end = Date.parse(config.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return { ok: false, message: "The end time must be after the start time." };
  }
  if (end - start < 60 * 60 * 1000) {
    return { ok: false, message: "Choose a date range of at least one hour." };
  }
  const spacing = timeframe === "1h" ? 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
  const expected = Math.floor((end - start) / spacing);
  if (expected > maxCandles) {
    return {
      ok: false,
      message: `That range needs about ${expected.toLocaleString()} candles, above the ${maxCandles.toLocaleString()} limit. Shorten the range or use 4h.`,
    };
  }
  if (expected < 60) {
    return { ok: false, message: "Choose a longer range; at least 60 candles are needed." };
  }
  return { ok: true, expected };
}

export function fixtureAvailability(
  coverage: CandleCoverage[],
  symbol: string,
  timeframe: string,
): { ok: boolean; message?: string; coverage: CandleCoverage | null } {
  const entry =
    coverage.find((item) => item.symbol === symbol && item.timeframe === timeframe) ?? null;
  if (!entry) {
    return {
      ok: false,
      message: `No workshop snapshot is loaded for ${symbol} ${timeframe}.`,
      coverage: null,
    };
  }
  return { ok: true, coverage: entry };
}

export function expectedWorkshopCount(timeframe: "1h" | "4h"): number {
  const spacing = timeframe === "1h" ? 3_600_000 : 14_400_000;
  return Math.floor((Date.parse(WORKSHOP.endTime) - Date.parse(WORKSHOP.startTime)) / spacing);
}

export function shareUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/share/${token}`;
}

export function maxCandlesFor(env: Env): number {
  return Math.min(env.MAX_CANDLES, LIMITS.maxCandles);
}

export function emptySummary(): BacktestSummaryDto | null {
  return null;
}

export function latestConfig(row: BacktestJobRecord): BacktestConfig {
  return row.config_json as BacktestConfig;
}

export function configHashFor(config: BacktestConfig): string {
  return computeConfigHash(config);
}

export async function perUserQueueStatus(
  store: Store,
  userId: string,
  jobId: string,
): Promise<BacktestJobRecord | null> {
  return store.getBacktestForUser(jobId, userId);
}
