import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Candle, CandleCoverage } from "@quantify/market-data";
import type { SqlClient } from "./client.js";
import type {
  BacktestJobRecord,
  CoverageRecord,
  EquityPointRecord,
  QueueJobRecord,
  SessionUserRecord,
  ShareRecord,
  StrategyRecord,
  StrategyVersionRecord,
  TradeRecord,
  UserRecord,
} from "./types.js";

function uuid(): string {
  return crypto.randomUUID();
}

export class Store {
  constructor(readonly client: SqlClient) {}

  async migrate(): Promise<void> {
    const path = fileURLToPath(new URL("../migrations/001_init.sql", import.meta.url));
    const sql = readFileSync(path, "utf8");
    await this.client.exec(sql);
    await this.client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      ["001_init"],
    );
  }

  // ---------------------------------------------------------------- users
  async createUser(input: {
    email: string;
    passwordHash: string;
    name?: string | null;
    isDemo?: boolean;
    id?: string;
  }): Promise<UserRecord> {
    const rows = await this.client.query<UserRecord>(
      `INSERT INTO users (id, email, password_hash, name, is_demo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        input.id ?? uuid(),
        input.email,
        input.passwordHash,
        input.name ?? null,
        input.isDemo ?? false,
      ],
    );
    return rows[0] as UserRecord;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.client.query<UserRecord>("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    return rows[0] ?? null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const rows = await this.client.query<UserRecord>("SELECT * FROM users WHERE id = $1", [id]);
    return rows[0] ?? null;
  }

  // ------------------------------------------------------------- sessions
  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ip?: string | null;
    id?: string;
  }): Promise<void> {
    await this.client.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.id ?? uuid(),
        input.userId,
        input.tokenHash,
        input.expiresAt,
        input.userAgent ?? null,
        input.ip ?? null,
      ],
    );
  }

  async findSessionUser(tokenHash: string): Promise<SessionUserRecord | null> {
    const rows = await this.client.query<SessionUserRecord>(
      `SELECT u.*, s.id AS session_id, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.client.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.client.query("DELETE FROM sessions WHERE expires_at <= now()");
  }

  // ----------------------------------------------------------- strategies
  async createStrategy(input: {
    userId: string;
    name: string;
    description: string;
    id?: string;
  }): Promise<StrategyRecord> {
    const rows = await this.client.query<StrategyRecord>(
      `INSERT INTO strategies (id, user_id, name, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.id ?? uuid(), input.userId, input.name, input.description],
    );
    return rows[0] as StrategyRecord;
  }

  async listStrategies(input: {
    userId: string;
    limit: number;
    cursor?: string;
    status?: "active" | "archived";
    query?: string;
  }): Promise<StrategyRecord[]> {
    const params: unknown[] = [input.userId];
    const conditions = ["s.user_id = $1"];
    if (input.status) {
      params.push(input.status);
      conditions.push(`s.status = $${params.length}`);
    }
    if (input.query) {
      params.push(`%${input.query}%`);
      conditions.push(`s.name ILIKE $${params.length}`);
    }
    if (input.cursor) {
      params.push(input.cursor);
      conditions.push(`s.updated_at < $${params.length}`);
    }
    params.push(input.limit + 1);
    const rows = await this.client.query<StrategyRecord>(
      `SELECT s.*,
         (SELECT v.version_number FROM strategy_versions v
           WHERE v.strategy_id = s.id ORDER BY v.version_number DESC LIMIT 1) AS latest_version_number,
         (SELECT v.spec_json FROM strategy_versions v
           WHERE v.strategy_id = s.id ORDER BY v.version_number DESC LIMIT 1) AS latest_spec_json,
         (SELECT b.status FROM backtest_jobs b
           JOIN strategy_versions v2 ON v2.id = b.strategy_version_id
           WHERE v2.strategy_id = s.id ORDER BY b.created_at DESC LIMIT 1) AS latest_backtest_status
       FROM strategies s
       WHERE ${conditions.join(" AND ")}
       ORDER BY s.updated_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  async getStrategyForUser(id: string, userId: string): Promise<StrategyRecord | null> {
    const rows = await this.client.query<StrategyRecord>(
      `SELECT s.*,
         (SELECT v.version_number FROM strategy_versions v
           WHERE v.strategy_id = s.id ORDER BY v.version_number DESC LIMIT 1) AS latest_version_number,
         (SELECT v.spec_json FROM strategy_versions v
           WHERE v.strategy_id = s.id ORDER BY v.version_number DESC LIMIT 1) AS latest_spec_json,
         (SELECT b.status FROM backtest_jobs b
           JOIN strategy_versions v2 ON v2.id = b.strategy_version_id
           WHERE v2.strategy_id = s.id ORDER BY b.created_at DESC LIMIT 1) AS latest_backtest_status
       FROM strategies s WHERE s.id = $1 AND s.user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async updateStrategy(
    id: string,
    userId: string,
    patch: { name?: string; description?: string; status?: "active" | "archived" },
  ): Promise<StrategyRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.description !== undefined) {
      params.push(patch.description);
      sets.push(`description = $${params.length}`);
    }
    if (patch.status !== undefined) {
      params.push(patch.status);
      sets.push(`status = $${params.length}`);
    }
    if (sets.length === 0) return this.getStrategyForUser(id, userId);
    sets.push("updated_at = now()");
    params.push(id, userId);
    const rows = await this.client.query<StrategyRecord>(
      `UPDATE strategies SET ${sets.join(", ")}
       WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }

  // ------------------------------------------------------------- versions
  async createVersion(input: {
    strategyId: string;
    spec: unknown;
    specHash: string;
    schemaVersion: string;
    sourcePrompt?: string | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<StrategyVersionRecord> {
    return this.client.transaction(async (tx) => {
      await tx.query("SELECT id FROM strategies WHERE id = $1 FOR UPDATE", [input.strategyId]);
      const maxRows = await tx.query<{ next: number }>(
        "SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM strategy_versions WHERE strategy_id = $1",
        [input.strategyId],
      );
      const versionNumber = Number(maxRows[0]?.next ?? 1);
      const rows = await tx.query<StrategyVersionRecord>(
        `INSERT INTO strategy_versions
          (id, strategy_id, version_number, schema_version, spec_json, spec_hash, source_prompt, generation_provider, generation_model)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) RETURNING *`,
        [
          uuid(),
          input.strategyId,
          versionNumber,
          input.schemaVersion,
          JSON.stringify(input.spec),
          input.specHash,
          input.sourcePrompt ?? null,
          input.provider ?? null,
          input.model ?? null,
        ],
      );
      await tx.query("UPDATE strategies SET updated_at = now() WHERE id = $1", [input.strategyId]);
      return rows[0] as StrategyVersionRecord;
    });
  }

  async listVersions(strategyId: string): Promise<StrategyVersionRecord[]> {
    return this.client.query<StrategyVersionRecord>(
      "SELECT * FROM strategy_versions WHERE strategy_id = $1 ORDER BY version_number DESC",
      [strategyId],
    );
  }

  async getVersionForUser(
    versionId: string,
    userId: string,
  ): Promise<StrategyVersionRecord | null> {
    const rows = await this.client.query<StrategyVersionRecord>(
      `SELECT v.*, s.name AS strategy_name, s.user_id AS strategy_user_id
       FROM strategy_versions v JOIN strategies s ON s.id = v.strategy_id
       WHERE v.id = $1 AND s.user_id = $2`,
      [versionId, userId],
    );
    return rows[0] ?? null;
  }

  async getVersion(versionId: string): Promise<StrategyVersionRecord | null> {
    const rows = await this.client.query<StrategyVersionRecord>(
      `SELECT v.*, s.name AS strategy_name, s.user_id AS strategy_user_id
       FROM strategy_versions v JOIN strategies s ON s.id = v.strategy_id
       WHERE v.id = $1`,
      [versionId],
    );
    return rows[0] ?? null;
  }

  // ---------------------------------------------------------- generations
  async insertGeneration(input: {
    userId: string;
    strategyId?: string | null;
    promptHash: string;
    provider: string;
    model: string | null;
    schemaVersion: string;
    status: string;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
  }): Promise<void> {
    await this.client.query(
      `INSERT INTO strategy_generations
        (id, user_id, strategy_id, prompt_hash, provider, model, schema_version, status, latency_ms, prompt_tokens, completion_tokens)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        uuid(),
        input.userId,
        input.strategyId ?? null,
        input.promptHash,
        input.provider,
        input.model,
        input.schemaVersion,
        input.status,
        input.latencyMs,
        input.promptTokens,
        input.completionTokens,
      ],
    );
  }

  async generationSpendUsd(
    userId: string,
  ): Promise<{ promptTokens: number; completionTokens: number }> {
    const rows = await this.client.query<{ prompt_tokens: number; completion_tokens: number }>(
      `SELECT COALESCE(SUM(prompt_tokens),0)::int AS prompt_tokens,
              COALESCE(SUM(completion_tokens),0)::int AS completion_tokens
       FROM strategy_generations
       WHERE user_id = $1 AND created_at >= date_trunc('day', now())`,
      [userId],
    );
    return {
      promptTokens: Number(rows[0]?.prompt_tokens ?? 0),
      completionTokens: Number(rows[0]?.completion_tokens ?? 0),
    };
  }

  // ------------------------------------------------------------ backtests
  async insertBacktestJob(input: {
    userId: string;
    strategyVersionId: string;
    config: unknown;
    configHash: string;
    engineVersion: string;
    id?: string;
  }): Promise<{ job: BacktestJobRecord; existing: boolean }> {
    const rows = await this.client.query<BacktestJobRecord>(
      `INSERT INTO backtest_jobs
        (id, user_id, strategy_version_id, status, config_json, config_hash, engine_version)
       VALUES ($1,$2,$3,'QUEUED',$4::jsonb,$5,$6)
       ON CONFLICT (strategy_version_id, config_hash) DO NOTHING RETURNING *`,
      [
        input.id ?? uuid(),
        input.userId,
        input.strategyVersionId,
        JSON.stringify(input.config),
        input.configHash,
        input.engineVersion,
      ],
    );
    if (rows[0]) return { job: rows[0], existing: false };
    const existing = await this.client.query<BacktestJobRecord>(
      "SELECT * FROM backtest_jobs WHERE strategy_version_id = $1 AND config_hash = $2",
      [input.strategyVersionId, input.configHash],
    );
    return { job: existing[0] as BacktestJobRecord, existing: true };
  }

  async getBacktestForUser(id: string, userId: string): Promise<BacktestJobRecord | null> {
    const rows = await this.client.query<BacktestJobRecord>(
      `SELECT b.*, v.strategy_id, v.version_number, s.name AS strategy_name,
              r.summary_json, r.warnings_json
       FROM backtest_jobs b
       JOIN strategy_versions v ON v.id = b.strategy_version_id
       JOIN strategies s ON s.id = v.strategy_id
       LEFT JOIN backtest_results r ON r.backtest_job_id = b.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async getBacktest(id: string): Promise<BacktestJobRecord | null> {
    const rows = await this.client.query<BacktestJobRecord>(
      `SELECT b.*, v.strategy_id, v.version_number, s.name AS strategy_name,
              r.summary_json, r.warnings_json
       FROM backtest_jobs b
       JOIN strategy_versions v ON v.id = b.strategy_version_id
       JOIN strategies s ON s.id = v.strategy_id
       LEFT JOIN backtest_results r ON r.backtest_job_id = b.id
       WHERE b.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async listBacktestsForUser(input: {
    userId: string;
    limit: number;
    cursor?: string;
  }): Promise<BacktestJobRecord[]> {
    const params: unknown[] = [input.userId];
    let cursorClause = "";
    if (input.cursor) {
      params.push(input.cursor);
      cursorClause = `AND b.created_at < $${params.length}`;
    }
    params.push(input.limit + 1);
    return this.client.query<BacktestJobRecord>(
      `SELECT b.*, v.strategy_id, v.version_number, s.name AS strategy_name,
              r.summary_json, r.warnings_json
       FROM backtest_jobs b
       JOIN strategy_versions v ON v.id = b.strategy_version_id
       JOIN strategies s ON s.id = v.strategy_id
       LEFT JOIN backtest_results r ON r.backtest_job_id = b.id
       WHERE b.user_id = $1 ${cursorClause}
       ORDER BY b.created_at DESC LIMIT $${params.length}`,
      params,
    );
  }

  async latestBacktestForVersion(
    versionId: string,
    userId: string,
  ): Promise<BacktestJobRecord | null> {
    const rows = await this.client.query<BacktestJobRecord>(
      `SELECT b.*, v.strategy_id, v.version_number, s.name AS strategy_name,
              r.summary_json, r.warnings_json
       FROM backtest_jobs b
       JOIN strategy_versions v ON v.id = b.strategy_version_id
       JOIN strategies s ON s.id = v.strategy_id
       LEFT JOIN backtest_results r ON r.backtest_job_id = b.id
       WHERE b.strategy_version_id = $1 AND b.user_id = $2 AND b.status = 'COMPLETED'
       ORDER BY b.completed_at DESC LIMIT 1`,
      [versionId, userId],
    );
    return rows[0] ?? null;
  }

  async listBacktestsForStrategy(
    strategyId: string,
    userId: string,
    limit: number,
  ): Promise<BacktestJobRecord[]> {
    return this.client.query<BacktestJobRecord>(
      `SELECT b.*, v.strategy_id, v.version_number, s.name AS strategy_name,
              r.summary_json, r.warnings_json
       FROM backtest_jobs b
       JOIN strategy_versions v ON v.id = b.strategy_version_id
       JOIN strategies s ON s.id = v.strategy_id
       LEFT JOIN backtest_results r ON r.backtest_job_id = b.id
       WHERE v.strategy_id = $1 AND b.user_id = $2
       ORDER BY b.created_at DESC LIMIT $3`,
      [strategyId, userId, limit],
    );
  }

  async queueDepth(): Promise<number> {
    const rows = await this.client.query<{ depth: number }>(
      "SELECT COUNT(*)::int AS depth FROM backtest_jobs WHERE status IN ('QUEUED','RUNNING')",
    );
    return Number(rows[0]?.depth ?? 0);
  }

  async countRunningForUser(userId: string): Promise<number> {
    const rows = await this.client.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM backtest_jobs WHERE user_id = $1 AND status = 'RUNNING'",
      [userId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async markRunning(jobId: string): Promise<boolean> {
    const rows = await this.client.query<{ id: string }>(
      `UPDATE backtest_jobs SET status = 'RUNNING', started_at = now(),
        error_code = NULL, error_message_safe = NULL
       WHERE id = $1 AND (
         status = 'QUEUED' OR
         status = 'FAILED' OR
         (status = 'RUNNING' AND started_at < now() - interval '5 minutes')
       ) RETURNING id`,
      [jobId],
    );
    return rows.length > 0;
  }

  async markFailed(jobId: string, code: string, message: string): Promise<void> {
    await this.client.query(
      `UPDATE backtest_jobs SET status = 'FAILED', error_code = $2, error_message_safe = $3,
        completed_at = now() WHERE id = $1 AND status <> 'COMPLETED'`,
      [jobId, code, message],
    );
  }

  async saveBacktestOutput(input: {
    jobId: string;
    summary: unknown;
    warnings: string[];
    trades: TradeRecord[];
    equity: Array<{ timestamp: number; equity: number; drawdownPct: number }>;
    manifest: unknown;
    outputHash: string;
  }): Promise<void> {
    await this.client.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO backtest_results (id, backtest_job_id, summary_json, warnings_json)
         VALUES ($1,$2,$3::jsonb,$4::jsonb)
         ON CONFLICT (backtest_job_id) DO UPDATE SET summary_json = EXCLUDED.summary_json,
           warnings_json = EXCLUDED.warnings_json`,
        [uuid(), input.jobId, JSON.stringify(input.summary), JSON.stringify(input.warnings)],
      );
      await tx.query("DELETE FROM backtest_trades WHERE backtest_job_id = $1", [input.jobId]);
      await tx.query("DELETE FROM backtest_equity_points WHERE backtest_job_id = $1", [
        input.jobId,
      ]);
      await insertMany(
        tx,
        `INSERT INTO backtest_trades
          (id, backtest_job_id, sequence_number, side, entry_time, exit_time, entry_price, exit_price,
           quantity, entry_fee, exit_fee, gross_pnl, net_pnl, return_pct, exit_reason)`,
        15,
        input.trades.map((trade) => [
          uuid(),
          input.jobId,
          trade.sequence_number,
          trade.side,
          trade.entry_time,
          trade.exit_time,
          trade.entry_price,
          trade.exit_price,
          trade.quantity,
          trade.entry_fee,
          trade.exit_fee,
          trade.gross_pnl,
          trade.net_pnl,
          trade.return_pct,
          trade.exit_reason,
        ]),
      );
      await insertMany(
        tx,
        "INSERT INTO backtest_equity_points (backtest_job_id, timestamp, equity, drawdown_pct)",
        4,
        input.equity.map((point) => [
          input.jobId,
          point.timestamp,
          point.equity,
          point.drawdownPct,
        ]),
      );
      await tx.query(
        `UPDATE backtest_jobs SET status = 'COMPLETED', completed_at = now(),
          data_manifest_json = $2::jsonb, output_hash = $3
         WHERE id = $1`,
        [input.jobId, JSON.stringify(input.manifest), input.outputHash],
      );
    });
  }

  async getTrades(jobId: string, limit: number, cursor?: number): Promise<TradeRecord[]> {
    const params: unknown[] = [jobId];
    let cursorClause = "";
    if (cursor !== undefined) {
      params.push(cursor);
      cursorClause = `AND sequence_number > $${params.length}`;
    }
    params.push(limit + 1);
    return this.client.query<TradeRecord>(
      `SELECT * FROM backtest_trades WHERE backtest_job_id = $1 ${cursorClause}
       ORDER BY sequence_number ASC LIMIT $${params.length}`,
      params,
    );
  }

  async getEquity(jobId: string): Promise<EquityPointRecord[]> {
    return this.client.query<EquityPointRecord>(
      "SELECT timestamp, equity, drawdown_pct FROM backtest_equity_points WHERE backtest_job_id = $1 ORDER BY timestamp ASC",
      [jobId],
    );
  }

  // --------------------------------------------------------------- shares
  async createShare(input: {
    jobId: string;
    tokenHash: string;
    expiresAt: Date;
    id?: string;
  }): Promise<ShareRecord> {
    const rows = await this.client.query<ShareRecord>(
      `INSERT INTO share_links (id, backtest_job_id, token_hash, expires_at)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [input.id ?? uuid(), input.jobId, input.tokenHash, input.expiresAt],
    );
    return rows[0] as ShareRecord;
  }

  async revokeSharesForJob(jobId: string): Promise<void> {
    await this.client.query(
      "UPDATE share_links SET revoked_at = now() WHERE backtest_job_id = $1 AND revoked_at IS NULL",
      [jobId],
    );
  }

  async findShare(tokenHash: string): Promise<ShareRecord | null> {
    const rows = await this.client.query<ShareRecord>(
      `SELECT * FROM share_links WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  // ---------------------------------------------------------- rate limits
  async consumeRateLimit(key: string, windowStart: Date): Promise<number> {
    const rows = await this.client.query<{ count: number }>(
      `INSERT INTO rate_limits (key, window_start, count) VALUES ($1,$2,1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [key, windowStart],
    );
    return Number(rows[0]?.count ?? 1);
  }

  // ------------------------------------------------------------ market data
  async readCandles(
    symbol: string,
    timeframe: string,
    fromMs: number,
    toMs: number,
  ): Promise<Candle[]> {
    const rows = await this.client.query<Record<string, string | number>>(
      `SELECT timestamp, open, high, low, close, volume FROM market_candles
       WHERE venue = 'indodax' AND symbol = $1 AND timeframe = $2
         AND timestamp >= $3 AND timestamp < $4 ORDER BY timestamp ASC`,
      [symbol, timeframe, fromMs, toMs],
    );
    return rows.map((row) => ({
      venue: "indodax",
      symbol: symbol as Candle["symbol"],
      timeframe: timeframe as Candle["timeframe"],
      timestamp: Number(row.timestamp),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }));
  }

  async upsertCandles(candles: readonly Candle[]): Promise<void> {
    if (candles.length === 0) return;
    for (let index = 0; index < candles.length; index += 500) {
      const chunk = candles.slice(index, index + 500);
      await insertMany(
        this.client,
        `INSERT INTO market_candles (venue, symbol, timeframe, timestamp, open, high, low, close, volume)`,
        9,
        chunk.map((candle) => [
          candle.venue,
          candle.symbol,
          candle.timeframe,
          candle.timestamp,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
        ]),
        `ON CONFLICT (venue, symbol, timeframe, timestamp) DO UPDATE SET
           open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
           close = EXCLUDED.close, volume = EXCLUDED.volume`,
      );
    }
  }

  async candleCoverage(): Promise<CandleCoverage[]> {
    const rows = await this.client.query<CoverageRecord>(
      `SELECT symbol, timeframe, MIN(timestamp) AS first_timestamp,
              MAX(timestamp) AS last_timestamp, COUNT(*) AS candle_count
       FROM market_candles GROUP BY symbol, timeframe ORDER BY symbol, timeframe`,
    );
    return rows.map((row) => ({
      symbol: row.symbol as CandleCoverage["symbol"],
      timeframe: row.timeframe as CandleCoverage["timeframe"],
      firstTimestamp: Number(row.first_timestamp),
      lastTimestamp: Number(row.last_timestamp),
      candleCount: Number(row.candle_count),
    }));
  }

  // ---------------------------------------------------------------- queue
  async enqueueJob(input: {
    name: string;
    payload: unknown;
    maxAttempts?: number;
    id?: string;
    runAt?: Date;
  }): Promise<string> {
    const id = input.id ?? uuid();
    await this.client.query(
      `INSERT INTO job_queue (id, name, payload, max_attempts, run_at)
       VALUES ($1,$2,$3::jsonb,$4,$5)`,
      [
        id,
        input.name,
        JSON.stringify(input.payload),
        input.maxAttempts ?? 3,
        input.runAt ?? new Date(),
      ],
    );
    return id;
  }

  async claimJob(workerId: string): Promise<QueueJobRecord | null> {
    return this.client.transaction(async (tx) => {
      const rows = await tx.query<QueueJobRecord>(
        `SELECT id, name, payload, attempts, max_attempts FROM job_queue
         WHERE status = 'QUEUED' AND run_at <= now()
         ORDER BY run_at ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const job = rows[0];
      if (!job) return null;
      await tx.query(
        `UPDATE job_queue SET status = 'RUNNING', attempts = attempts + 1,
          locked_at = now(), locked_by = $2, updated_at = now() WHERE id = $1`,
        [job.id, workerId],
      );
      return job;
    });
  }

  async completeJob(jobId: string): Promise<void> {
    await this.client.query(
      "UPDATE job_queue SET status = 'COMPLETED', updated_at = now() WHERE id = $1",
      [jobId],
    );
  }

  async retryJob(jobId: string, error: string): Promise<"retry" | "failed"> {
    const rows = await this.client.query<{ attempts: number; max_attempts: number }>(
      "SELECT attempts, max_attempts FROM job_queue WHERE id = $1",
      [jobId],
    );
    const job = rows[0];
    if (!job) return "failed";
    if (job.attempts < job.max_attempts) {
      const delaySeconds = Math.min(60, 2 ** job.attempts * 5);
      await this.client.query(
        `UPDATE job_queue SET status = 'QUEUED', run_at = now() + ($2 || ' seconds')::interval,
          last_error = $3, locked_at = NULL, locked_by = NULL, updated_at = now()
         WHERE id = $1`,
        [jobId, String(delaySeconds), error],
      );
      return "retry";
    }
    await this.client.query(
      `UPDATE job_queue SET status = 'FAILED', last_error = $2, updated_at = now() WHERE id = $1`,
      [jobId, error],
    );
    return "failed";
  }

  async failJob(jobId: string, error: string): Promise<void> {
    await this.client.query(
      `UPDATE job_queue SET status = 'FAILED', last_error = $2, updated_at = now() WHERE id = $1`,
      [jobId, error],
    );
  }

  async recoverStaleJobs(olderThanSeconds = 300): Promise<number> {
    const rows = await this.client.query<{ id: string }>(
      `UPDATE job_queue SET status = 'QUEUED', locked_at = NULL, locked_by = NULL,
         run_at = now(), updated_at = now()
       WHERE status = 'RUNNING' AND locked_at < now() - ($1 || ' seconds')::interval
       RETURNING id`,
      [String(olderThanSeconds)],
    );
    return rows.length;
  }

  async queueStats(): Promise<{ queued: number; running: number; failed: number }> {
    const rows = await this.client.query<{ status: string; count: number }>(
      "SELECT status, COUNT(*)::int AS count FROM job_queue GROUP BY status",
    );
    const stats = { queued: 0, running: 0, failed: 0 };
    for (const row of rows) {
      if (row.status === "QUEUED") stats.queued = Number(row.count);
      if (row.status === "RUNNING") stats.running = Number(row.count);
      if (row.status === "FAILED") stats.failed = Number(row.count);
    }
    return stats;
  }
}

async function insertMany(
  client: SqlClient,
  prefix: string,
  columns: number,
  rows: unknown[][],
  suffix = "",
): Promise<void> {
  if (rows.length === 0) return;
  const chunkSize = Math.max(1, Math.floor(500 / columns));
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const params: unknown[] = [];
    const values = chunk
      .map((row, rowIndex) => {
        const placeholders = row.map((value, columnIndex) => {
          params.push(value);
          return `$${rowIndex * columns + columnIndex + 1}`;
        });
        return `(${placeholders.join(",")})`;
      })
      .join(",");
    await client.query(`${prefix} VALUES ${values} ${suffix}`, params);
  }
}
