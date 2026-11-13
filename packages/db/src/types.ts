export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type SessionUserRecord = UserRecord & { session_id: string; expires_at: string };

export type StrategyRecord = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  latest_version_number: number | null;
  latest_spec_json: unknown | null;
  latest_backtest_status: string | null;
};

export type StrategyVersionRecord = {
  id: string;
  strategy_id: string;
  version_number: number;
  schema_version: string;
  spec_json: unknown;
  spec_hash: string;
  source_prompt: string | null;
  generation_provider: string | null;
  generation_model: string | null;
  created_at: string;
  strategy_name?: string;
  strategy_user_id?: string;
};

export type BacktestJobRecord = {
  id: string;
  user_id: string;
  strategy_version_id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  config_json: unknown;
  config_hash: string;
  engine_version: string;
  data_manifest_json: unknown | null;
  output_hash: string | null;
  error_code: string | null;
  error_message_safe: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  strategy_id?: string;
  strategy_name?: string;
  version_number?: number;
  summary_json?: unknown | null;
  warnings_json?: unknown[] | null;
};

export type TradeRecord = {
  sequence_number: number;
  side: string;
  entry_time: string;
  exit_time: string;
  entry_price: string | number;
  exit_price: string | number;
  quantity: string | number;
  entry_fee: string | number;
  exit_fee: string | number;
  gross_pnl: string | number;
  net_pnl: string | number;
  return_pct: string | number;
  exit_reason: string;
};

export type EquityPointRecord = {
  timestamp: string | number;
  equity: string | number;
  drawdown_pct: string | number;
};

export type CoverageRecord = {
  symbol: string;
  timeframe: string;
  first_timestamp: string | number;
  last_timestamp: string | number;
  candle_count: string | number;
};

export type QueueJobRecord = {
  id: string;
  name: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
};

export type ShareRecord = {
  id: string;
  backtest_job_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
};
