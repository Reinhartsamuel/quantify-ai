"use client";

import type {
  ApiError,
  BacktestJobDto,
  EquityPointDto,
  Paginated,
  SessionUser,
  StrategyDto,
  StrategyVersionDto,
  TradeDto,
} from "@quantify/contracts";

export type {
  ApiError,
  BacktestJobDto,
  EquityPointDto,
  Paginated,
  SessionUser,
  StrategyDto,
  StrategyVersionDto,
  TradeDto,
};

export type StrategyTemplate = {
  id: string;
  name: string;
  description: string;
  teaches: string;
  spec: StrategySpecLike;
};

export type StrategySpecLike = {
  schemaVersion: "1.0";
  name: string;
  description: string;
  market: {
    venue: "indodax";
    marketType: "spot";
    symbol: "BTC/IDR" | "ETH/IDR";
    timeframe: "1h" | "4h";
  };
  indicators: Array<Record<string, unknown> & { id: string; type: string }>;
  entry: ConditionLike;
  exit: ConditionLike;
  risk: {
    positionSizing: { type: "percent_equity"; value: number };
    stopLossPct: number | null;
    takeProfitPct: number | null;
    maxOpenPositions: 1;
  };
};

export type ConditionLike = Record<string, unknown>;

export type GeneratedResult = {
  status: "ok" | "needs_clarification" | "unsupported";
  spec?: StrategySpecLike;
  questions?: string[];
  assumptions?: string[];
  explanation?: string;
  warnings?: string[];
  provider: "openai-compatible" | "template";
  generationMeta?: {
    provider: string;
    model: string | null;
    latencyMs: number;
    fallback: boolean;
    fallbackReason?: string;
  };
};

export type BacktestDetail = {
  backtest: BacktestJobDto;
  spec: StrategySpecLike | null;
  explanation: {
    entry: string;
    exit: string;
    risk: string;
    indicators: string[];
    summary: string;
  } | null;
  disclosure: string;
};

export type Availability = {
  symbol: string;
  timeframe: string;
  available: boolean;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  candleCount: number;
  lastIso: string | null;
  source: string;
  workshopRange: { startTime: string; endTime: string };
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)quantify_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1] as string) : null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const csrf = csrfToken();
  if (csrf && init.method && init.method !== "GET") headers.set("x-csrf-token", csrf);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const error = (payload as ApiError | null)?.error;
    throw new ApiClientError(
      error?.code ?? "INTERNAL",
      error?.message ?? `Request failed (${response.status}).`,
      response.status,
      error?.details,
      error?.requestId,
    );
  }
  return payload as T;
}

export const api = {
  getSession: () => request<{ user: SessionUser | null }>("/api/auth/session"),
  signIn: (input: { email: string; password: string }) =>
    request<{ user: SessionUser }>("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  signUp: (input: { email: string; password: string; name?: string }) =>
    request<{ user: SessionUser }>("/api/auth/sign-up", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  signOut: () => request<{ signedOut: boolean }>("/api/auth/sign-out", { method: "POST" }),

  listStrategies: (params: { status?: string; q?: string; cursor?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    if (params.q) search.set("q", params.q);
    if (params.cursor) search.set("cursor", params.cursor);
    return request<Paginated<StrategyDto>>(`/api/v1/strategies?${search.toString()}`);
  },
  getStrategy: (id: string) =>
    request<{ strategy: StrategyDto; versions: StrategyVersionDto[] }>(`/api/v1/strategies/${id}`),
  createStrategy: (input: { name: string; description: string }) =>
    request<{ strategy: StrategyDto }>("/api/v1/strategies", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateStrategy: (id: string, input: { name?: string; description?: string; status?: string }) =>
    request<{ strategy: StrategyDto }>(`/api/v1/strategies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  saveVersion: (id: string, input: { spec: unknown; sourcePrompt?: string }) =>
    request<{ version: StrategyVersionDto; existing: boolean }>(
      `/api/v1/strategies/${id}/versions`,
      {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "idempotency-key": crypto.randomUUID() },
      },
    ),
  getVersion: (strategyId: string, versionId: string) =>
    request<{ version: StrategyVersionDto }>(
      `/api/v1/strategies/${strategyId}/versions/${versionId}`,
    ),
  compareVersions: (strategyId: string, versionId: string, against: string) =>
    request<{
      current: { version: StrategyVersionDto; summary: Record<string, unknown> | null };
      against: { version: StrategyVersionDto; summary: Record<string, number | null> | null };
      sameConfig: boolean;
    }>(
      `/api/v1/strategies/${strategyId}/versions/${versionId}/compare?against=${encodeURIComponent(against)}`,
    ),
  generate: (input: { prompt: string; symbol: string; timeframe: string }) =>
    request<GeneratedResult>("/api/v1/strategies/generate", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  templates: () => request<{ templates: StrategyTemplate[] }>("/api/v1/strategies/templates"),

  submitBacktest: (input: { strategyVersionId: string; config: Record<string, unknown> }) =>
    request<{ backtestId: string; status: string; existing: boolean }>("/api/v1/backtests", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listBacktests: (cursor?: string) =>
    request<Paginated<BacktestJobDto>>(
      `/api/v1/backtests${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  getBacktest: (id: string) => request<BacktestDetail>(`/api/v1/backtests/${id}`),
  getTrades: (id: string, cursor?: string) =>
    request<Paginated<TradeDto>>(
      `/api/v1/backtests/${id}/trades${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  getEquity: (id: string) =>
    request<{ points: EquityPointDto[] }>(`/api/v1/backtests/${id}/equity-curve?maxPoints=2000`),
  shareBacktest: (id: string, days = 14) =>
    request<{ url: string; token: string; expiresAt: string }>(`/api/v1/backtests/${id}/share`, {
      method: "POST",
      body: JSON.stringify({ expiresInDays: days }),
    }),
  revokeShare: (id: string) =>
    request<{ revoked: boolean }>(`/api/v1/backtests/${id}/share`, { method: "DELETE" }),
  shareResult: (token: string) =>
    request<{
      result: BacktestJobDto;
      explanation: BacktestDetail["explanation"];
      disclosure: string;
      expiresAt: string;
    }>(`/api/share/${token}`),
  availability: (symbol: string, timeframe: string) =>
    request<Availability>(
      `/api/v1/market-data/availability?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
    ),
  listStrategyBacktests: (id: string) =>
    request<{ items: BacktestJobDto[] }>(`/api/v1/strategies/${id}/backtests`),
  me: () => request<{ user: SessionUser }>("/api/v1/me"),
};

export function isApiError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export function downloadCsv(backtestId: string): void {
  window.location.href = `${API_URL}/api/v1/backtests/${backtestId}/trades.csv`;
}
