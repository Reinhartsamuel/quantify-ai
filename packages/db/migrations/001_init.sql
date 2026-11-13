CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS strategies (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategies_user_updated_idx ON strategies (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS strategy_versions (
  id uuid PRIMARY KEY,
  strategy_id uuid NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  schema_version text NOT NULL,
  spec_json jsonb NOT NULL,
  spec_hash text NOT NULL,
  source_prompt text,
  generation_provider text,
  generation_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, version_number)
);
CREATE INDEX IF NOT EXISTS strategy_versions_strategy_idx ON strategy_versions (strategy_id, version_number DESC);

CREATE TABLE IF NOT EXISTS strategy_generations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy_id uuid REFERENCES strategies(id) ON DELETE SET NULL,
  prompt_hash text NOT NULL,
  provider text NOT NULL,
  model text,
  schema_version text NOT NULL,
  status text NOT NULL,
  latency_ms integer NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategy_generations_user_idx ON strategy_generations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backtest_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  config_json jsonb NOT NULL,
  config_hash text NOT NULL,
  engine_version text NOT NULL,
  data_manifest_json jsonb,
  output_hash text,
  error_code text,
  error_message_safe text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (strategy_version_id, config_hash)
);
CREATE INDEX IF NOT EXISTS backtest_jobs_user_idx ON backtest_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS backtest_jobs_status_idx ON backtest_jobs (status, created_at);

CREATE TABLE IF NOT EXISTS backtest_results (
  id uuid PRIMARY KEY,
  backtest_job_id uuid NOT NULL UNIQUE REFERENCES backtest_jobs(id) ON DELETE CASCADE,
  summary_json jsonb NOT NULL,
  warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backtest_trades (
  id uuid PRIMARY KEY,
  backtest_job_id uuid NOT NULL REFERENCES backtest_jobs(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL,
  side text NOT NULL,
  entry_time timestamptz NOT NULL,
  exit_time timestamptz NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric NOT NULL,
  quantity numeric NOT NULL,
  entry_fee numeric NOT NULL,
  exit_fee numeric NOT NULL,
  gross_pnl numeric NOT NULL,
  net_pnl numeric NOT NULL,
  return_pct numeric NOT NULL,
  exit_reason text NOT NULL,
  UNIQUE (backtest_job_id, sequence_number)
);
CREATE INDEX IF NOT EXISTS backtest_trades_job_idx ON backtest_trades (backtest_job_id, sequence_number);

CREATE TABLE IF NOT EXISTS backtest_equity_points (
  backtest_job_id uuid NOT NULL REFERENCES backtest_jobs(id) ON DELETE CASCADE,
  timestamp bigint NOT NULL,
  equity numeric NOT NULL,
  drawdown_pct numeric NOT NULL,
  PRIMARY KEY (backtest_job_id, timestamp)
);

CREATE TABLE IF NOT EXISTS market_candles (
  venue text NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  timestamp bigint NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume numeric NOT NULL,
  PRIMARY KEY (venue, symbol, timeframe, timestamp)
);
CREATE INDEX IF NOT EXISTS market_candles_symbol_idx ON market_candles (venue, symbol, timeframe, timestamp);

CREATE TABLE IF NOT EXISTS rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE IF NOT EXISTS share_links (
  id uuid PRIMARY KEY,
  backtest_job_id uuid NOT NULL REFERENCES backtest_jobs(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS share_links_job_idx ON share_links (backtest_job_id);

CREATE TABLE IF NOT EXISTS job_queue (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_queue_status_idx ON job_queue (status, run_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
