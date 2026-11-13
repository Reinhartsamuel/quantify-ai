import { backtestConfigSchema, EngineError, runBacktest } from "@quantify/backtest-engine";
import { ENGINE_VERSION, type Env } from "@quantify/config";
import type { Store } from "@quantify/db";
import type { Candle } from "@quantify/market-data";
import { MarketDataError, type MarketDataService } from "@quantify/market-data";
import { parseStrategySpec } from "@quantify/strategy-spec";

export type ProcessResult =
  | { status: "completed"; jobId: string; outputHash: string }
  | { status: "failed"; jobId: string; code: string; message: string; retryable: boolean }
  | { status: "skipped"; jobId: string; reason: string };

export type ProcessorDeps = {
  store: Store;
  marketData: MarketDataService;
  env: Env;
  logger?: (level: "info" | "warn" | "error", message: string, meta?: unknown) => void;
};

export async function processBacktestJob(
  jobId: string,
  deps: ProcessorDeps,
): Promise<ProcessResult> {
  const { store, marketData, env } = deps;
  const log = deps.logger ?? (() => undefined);
  const job = await store.getBacktest(jobId);
  if (!job) {
    return { status: "skipped", jobId, reason: "job_not_found" };
  }
  if (job.status === "COMPLETED") {
    return { status: "completed", jobId, outputHash: job.output_hash ?? "" };
  }
  const claimed = await store.markRunning(jobId);
  if (!claimed && job.status !== "RUNNING") {
    return { status: "skipped", jobId, reason: `status_${job.status}` };
  }

  try {
    const version = await store.getVersion(job.strategy_version_id);
    if (!version) {
      throw new EngineError("Strategy version no longer exists.", "VALIDATION_FAILED");
    }
    const spec = parseStrategySpec(version.spec_json);
    if (!spec.ok) {
      throw new EngineError(
        spec.errors.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
        "VALIDATION_FAILED",
      );
    }
    const config = backtestConfigSchema.safeParse(job.config_json);
    if (!config.success) {
      throw new EngineError("Stored backtest configuration is invalid.", "VALIDATION_FAILED");
    }
    const startMs = Date.parse(config.data.startTime);
    const endMs = Date.parse(config.data.endTime);
    const market = await marketData.getCandles({
      symbol: spec.spec.market.symbol,
      timeframe: spec.spec.market.timeframe,
      fromMs: startMs,
      toMs: endMs,
    });
    if (market.candles.length > env.MAX_CANDLES) {
      throw new EngineError(
        `The range needs ${market.candles.length} candles, above the ${env.MAX_CANDLES} limit.`,
        "INSUFFICIENT_DATA",
      );
    }
    const output = runBacktest({
      spec: spec.spec,
      candles: market.candles as Candle[],
      config: config.data,
      dataManifest: market.manifest,
      engineVersion: ENGINE_VERSION,
      extraWarnings: market.warnings,
    });
    await store.saveBacktestOutput({
      jobId,
      summary: output.summary,
      warnings: output.warnings,
      trades: output.trades.map((trade) => ({
        sequence_number: trade.sequenceNumber,
        side: trade.side,
        entry_time: trade.entryTime,
        exit_time: trade.exitTime,
        entry_price: trade.entryPrice,
        exit_price: trade.exitPrice,
        quantity: trade.quantity,
        entry_fee: trade.entryFee,
        exit_fee: trade.exitFee,
        gross_pnl: trade.grossPnl,
        net_pnl: trade.netPnl,
        return_pct: trade.returnPct,
        exit_reason: trade.exitReason,
      })),
      equity: output.equityCurve,
      manifest: output.metadata.dataManifest,
      outputHash: output.metadata.outputHash,
    });
    log("info", "backtest.completed", {
      jobId,
      trades: output.trades.length,
      candles: market.candles.length,
      outputHash: output.metadata.outputHash,
    });
    return { status: "completed", jobId, outputHash: output.metadata.outputHash };
  } catch (error) {
    const mapped = mapError(error);
    await store.markFailed(jobId, mapped.code, mapped.message);
    log("error", "backtest.failed", { jobId, code: mapped.code });
    return {
      status: "failed",
      jobId,
      code: mapped.code,
      message: mapped.message,
      retryable: mapped.retryable,
    };
  }
}

function mapError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof MarketDataError) {
    const retryable = error.code === "RATE_LIMITED" || error.code === "PROVIDER_UNAVAILABLE";
    return { code: error.code, message: error.message, retryable };
  }
  if (error instanceof EngineError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof Error && /timeout|ECONN|ETIMEDOUT|connection/i.test(error.message)) {
    return {
      code: "DB_TEMPORARY",
      message: "A temporary service error interrupted the backtest. It will be retried.",
      retryable: true,
    };
  }
  return {
    code: "BACKTEST_FAILED",
    message: "The backtest failed unexpectedly. Reference this job with support.",
    retryable: false,
  };
}
