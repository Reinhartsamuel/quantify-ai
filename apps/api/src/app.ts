import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AIProviderError } from "@quantify/ai";
import type { AuthService, AuthUser } from "@quantify/auth";
import { hashToken } from "@quantify/auth";
import { backtestConfigSchema } from "@quantify/backtest-engine";
import type { Env } from "@quantify/config";
import {
  ENGINE_VERSION,
  isProduction,
  LIMITS,
  SIMULATION_DISCLOSURE,
  WORKSHOP,
} from "@quantify/config";
import {
  type ApiError,
  compareQuerySchema,
  createStrategySchema,
  type ErrorCode,
  equityQuerySchema,
  generateRequestSchema,
  paginationSchema,
  saveVersionSchema,
  shareRequestSchema,
  signInSchema,
  signUpSchema,
  submitBacktestSchema,
  updateStrategySchema,
} from "@quantify/contracts";
import type { Store } from "@quantify/db";
import type { MarketDataService } from "@quantify/market-data";
import { hashObject, MarketDataError } from "@quantify/market-data";
import { parseStrategySpec, renderSpec, TEMPLATES } from "@quantify/strategy-spec";
import { type Context, Hono } from "hono";
import { ZodError, type ZodType, type z } from "zod";
import {
  backtestDto,
  configHashFor,
  expectedWorkshopCount,
  fixtureAvailability,
  iso,
  maxCandlesFor,
  num,
  shareUrl,
  strategyDto,
  tradeDto,
  validateBacktestRange,
  versionDto,
} from "./dto.js";

type Variables = {
  requestId: string;
  user: AuthUser;
  tokenHash: string;
};

type AppDeps = {
  store: Store;
  auth: AuthService;
  env: Env;
  ai: {
    generate: (
      input: {
        prompt: string;
        market: { venue: "indodax"; symbol: "BTC/IDR" | "ETH/IDR"; timeframe: "1h" | "4h" };
      },
      options?: { budgetRemainingUsd?: number },
    ) => Promise<{
      result: unknown;
      meta: {
        provider: string;
        model: string | null;
        latencyMs: number;
        promptTokens: number;
        completionTokens: number;
        fallback: boolean;
        fallbackReason?: string;
      };
    }>;
    estimateCost: (promptTokens: number, completionTokens: number) => number;
  };
  marketData: MarketDataService;
  processJob?: (jobId: string) => Promise<unknown>;
};

class ApiException extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiException";
  }
}

export function createApp(deps: AppDeps): Hono<{ Variables: Variables }> {
  const { store, auth, env, ai, marketData } = deps;
  const app = new Hono<{ Variables: Variables }>();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    c.header("x-content-type-options", "nosniff");
    c.header("x-frame-options", "DENY");
    c.header("referrer-policy", "no-referrer");
    c.header(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (isProduction(env)) {
      c.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    const origin = c.req.header("origin");
    if (origin) {
      const allowed = env.TRUSTED_ORIGINS.split(",").map((value) => value.trim());
      if (allowed.includes(origin)) {
        c.header("access-control-allow-origin", origin);
        c.header("access-control-allow-credentials", "true");
        c.header("vary", "Origin");
        c.header(
          "access-control-allow-headers",
          "content-type, x-csrf-token, idempotency-key, x-request-id",
        );
        c.header("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
      }
    }
    if (c.req.method === "OPTIONS") return c.body(null, 204);

    const contentLength = Number(c.req.header("content-length") ?? "0");
    const isGenerate = new URL(c.req.url).pathname === "/api/v1/strategies/generate";
    const maxBytes = isGenerate ? LIMITS.maxBodyBytes : LIMITS.smallBodyBytes;
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new ApiException(413, "VALIDATION_FAILED", "Request body is too large.");
    }

    const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method);
    if (mutating && origin) {
      const allowed = env.TRUSTED_ORIGINS.split(",").map((value) => value.trim());
      if (!allowed.includes(origin)) {
        throw new ApiException(403, "FORBIDDEN", "Request origin is not allowed.");
      }
    }

    const started = performance.now();
    await next();
    const durationMs = Math.round(performance.now() - started);
    if (env.LOG_LEVEL !== "error") {
      console.log(
        JSON.stringify({
          level: "info",
          type: "request",
          requestId,
          method: c.req.method,
          path: new URL(c.req.url).pathname,
          status: c.res.status,
          durationMs,
        }),
      );
    }
  });

  app.notFound((c) =>
    c.json<ApiError>(
      {
        error: {
          code: "NOT_FOUND",
          message: "The requested resource was not found.",
          requestId: c.get("requestId") ?? crypto.randomUUID(),
        },
      },
      404,
    ),
  );

  app.onError((error, c) => {
    const requestId = c.get("requestId") ?? crypto.randomUUID();
    if (error instanceof ApiException) {
      const body: ApiError = {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          details: error.details,
          retryAfterSeconds: error.retryAfterSeconds,
        },
      };
      if (error.retryAfterSeconds) {
        c.header("retry-after", String(error.retryAfterSeconds));
      }
      return c.json(body, error.status as 400);
    }
    if (error instanceof ZodError) {
      return c.json<ApiError>(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "Some fields are invalid.",
            requestId,
            details: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        422,
      );
    }
    if (error instanceof AIProviderError) {
      return c.json<ApiError>(
        {
          error: {
            code: "AI_PROVIDER_UNAVAILABLE",
            message: "The AI provider is unavailable. The template fallback remains available.",
            requestId,
          },
        },
        502,
      );
    }
    if (error instanceof MarketDataError) {
      const code: ErrorCode =
        error.code === "DATA_QUALITY_GAP" ? "DATA_QUALITY_GAP" : "MARKET_DATA_UNAVAILABLE";
      return c.json<ApiError>({ error: { code, message: error.message, requestId } }, 422);
    }
    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        error: error instanceof Error ? error.stack : String(error),
      }),
    );
    return c.json<ApiError>(
      {
        error: {
          code: "INTERNAL",
          message: "Something went wrong. Quote the request ID when asking for support.",
          requestId,
        },
      },
      500,
    );
  });

  // ------------------------------------------------------------------ auth
  app.post("/api/auth/sign-up", async (c) => {
    await enforceAuthRateLimit(c, store, env, "sign-up");
    const body = await readJson(c, signUpSchema);
    const session = await auth.signUp(body);
    for (const cookie of auth.sessionCookies(session)) {
      c.header("set-cookie", cookie, { append: true });
    }
    return c.json({ user: session.user }, 201);
  });

  app.post("/api/auth/sign-in", async (c) => {
    await enforceAuthRateLimit(c, store, env, "sign-in");
    const body = await readJson(c, signInSchema);
    const session = await auth.signIn(body);
    for (const cookie of auth.sessionCookies(session)) {
      c.header("set-cookie", cookie, { append: true });
    }
    return c.json({ user: session.user });
  });

  app.post("/api/auth/sign-out", async (c) => {
    const current = await auth.getSession(c.req.header("cookie"));
    if (current && !auth.verifyCsrf(c.req.header("cookie"), c.req.header("x-csrf-token"))) {
      throw new ApiException(403, "FORBIDDEN", "A valid CSRF token is required.");
    }
    await auth.signOut(current?.tokenHash ?? null);
    for (const cookie of auth.clearCookies()) {
      c.header("set-cookie", cookie, { append: true });
    }
    return c.json({ signedOut: true });
  });

  app.get("/api/auth/session", async (c) => {
    const current = await auth.getSession(c.req.header("cookie"));
    return c.json({ user: current?.user ?? null });
  });

  // ---------------------------------------------------------------- health
  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      version: "0.1.0",
      engineVersion: ENGINE_VERSION,
      time: new Date().toISOString(),
    }),
  );

  app.get("/api/ready", async (c) => {
    const checks: Record<string, unknown> = {};
    let ok = true;
    try {
      await store.client.query("SELECT 1");
      checks.database = "ok";
    } catch {
      checks.database = "error";
      ok = false;
    }
    try {
      checks.queue = await store.queueStats();
    } catch {
      checks.queue = "error";
      ok = false;
    }
    let coverage: unknown[] = [];
    try {
      coverage =
        env.MARKET_DATA_MODE === "fixture"
          ? await marketData.coverage()
          : await store.candleCoverage();
      checks.marketData = { mode: env.MARKET_DATA_MODE, series: coverage.length };
    } catch {
      checks.marketData = "error";
      ok = false;
    }
    return c.json(
      { status: ok ? "ready" : "degraded", checks, time: new Date().toISOString() },
      ok ? 200 : 503,
    );
  });

  app.get("/api/health/market-data", async (c) => {
    const coverage =
      env.MARKET_DATA_MODE === "fixture"
        ? await marketData.coverage()
        : await store.candleCoverage();
    const snapshot = readSnapshotManifest(env);
    const series = (["BTC/IDR", "ETH/IDR"] as const).flatMap((symbol) =>
      (["1h", "4h"] as const).map((timeframe) => {
        const entry = coverage.find(
          (item) => item.symbol === symbol && item.timeframe === timeframe,
        );
        const details = snapshot?.series.find(
          (item) => item.symbol === symbol && item.timeframe === timeframe,
        );
        const expected = expectedWorkshopCount(timeframe);
        return {
          symbol,
          timeframe,
          cached: entry
            ? {
                candleCount: entry.candleCount,
                firstTimestamp: entry.firstTimestamp,
                lastTimestamp: entry.lastTimestamp,
                firstIso: new Date(entry.firstTimestamp).toISOString(),
                lastIso: new Date(entry.lastTimestamp).toISOString(),
                gaps: details?.gaps ?? null,
                maxGapCandles: details?.maxGapCandles ?? null,
                zeroVolumeCandles: details?.zeroVolumeCandles ?? null,
                sha256: details?.sha256 ?? null,
              }
            : null,
          expectedWorkshopCandles: expected,
          snapshotGeneratedAt: snapshot?.generatedAt ?? null,
          lastRefresh:
            details?.fetchedAt ?? (entry ? new Date(entry.lastTimestamp).toISOString() : null),
          workshopRangeCovered: Boolean(
            entry &&
              entry.firstTimestamp <= Date.parse(WORKSHOP.startTime) &&
              entry.lastTimestamp >= Date.parse(WORKSHOP.endTime) - 4 * 60 * 60 * 1000,
          ),
        };
      }),
    );
    const ok = series.every((entry) => entry.cached !== null);
    return c.json(
      { ok, mode: env.MARKET_DATA_MODE, generatedAt: snapshot?.generatedAt ?? null, series },
      ok ? 200 : 503,
    );
  });

  app.get("/api/health/queue", async (c) => {
    const stats = await store.queueStats();
    const depth = await store.queueDepth();
    return c.json({ ...stats, depth, alert: depth > 100 });
  });

  // ------------------------------------------------------------- public share
  const shared = async (c: Context<{ Variables: Variables }>) => {
    const token = c.req.param("token") ?? "";
    if (!token) throw new ApiException(404, "NOT_FOUND", "Share link not found.");
    const share = await store.findShare(hashToken(token));
    if (!share) throw new ApiException(404, "NOT_FOUND", "Share link not found or expired.");
    const job = await store.getBacktest(share.backtest_job_id);
    if (job?.status !== "COMPLETED") {
      throw new ApiException(404, "NOT_FOUND", "Shared result is not available.");
    }
    const version = await store.getVersion(job.strategy_version_id);
    const spec = version?.spec_json ? parseStrategySpec(version.spec_json) : null;
    return c.json({
      result: backtestDto(job),
      explanation: spec?.ok ? renderSpec(spec.spec) : null,
      disclosure: SIMULATION_DISCLOSURE,
      expiresAt: iso(share.expires_at),
    });
  };
  app.get("/api/share/:token", shared);
  app.get("/api/v1/share/:token", shared);

  // --------------------------------------------------------- authenticated
  app.use("/api/v1/*", async (c, next) => {
    const session = await auth.getSession(c.req.header("cookie"));
    if (!session) {
      throw new ApiException(401, "UNAUTHORIZED", "Sign in to continue.");
    }
    c.set("user", session.user);
    c.set("tokenHash", session.tokenHash);
    const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method);
    if (mutating && !auth.verifyCsrf(c.req.header("cookie"), c.req.header("x-csrf-token"))) {
      throw new ApiException(403, "FORBIDDEN", "A valid CSRF token is required.");
    }
    await next();
  });

  app.get("/api/v1/me", (c) => c.json({ user: c.get("user") }));

  // --------------------------------------------------------------- market
  app.get("/api/v1/market-data/symbols", (c) =>
    c.json({ symbols: ["BTC/IDR", "ETH/IDR"], venue: "indodax", quote: "IDR" }),
  );
  app.get("/api/v1/market-data/timeframes", (c) =>
    c.json({ timeframes: ["1h", "4h"], maxCandles: maxCandlesFor(env) }),
  );
  app.get("/api/v1/market-data/availability", async (c) => {
    const symbol = c.req.query("symbol");
    const timeframe = c.req.query("timeframe");
    if (!["BTC/IDR", "ETH/IDR"].includes(symbol ?? "") || !["1h", "4h"].includes(timeframe ?? "")) {
      throw new ApiException(422, "VALIDATION_FAILED", "Provide a supported symbol and timeframe.");
    }
    const coverage =
      env.MARKET_DATA_MODE === "fixture"
        ? await marketData.coverage()
        : await store.candleCoverage();
    const entry = coverage.find((item) => item.symbol === symbol && item.timeframe === timeframe);
    const availability = entry
      ? {
          symbol,
          timeframe,
          available: true,
          firstTimestamp: entry.firstTimestamp,
          lastTimestamp: entry.lastTimestamp,
          candleCount: entry.candleCount,
          lastIso: new Date(entry.lastTimestamp).toISOString(),
        }
      : {
          symbol,
          timeframe,
          available: false,
          firstTimestamp: null,
          lastTimestamp: null,
          candleCount: 0,
          lastIso: null,
        };
    return c.json({
      ...availability,
      source: env.MARKET_DATA_MODE,
      workshopRange: { startTime: WORKSHOP.startTime, endTime: WORKSHOP.endTime },
    });
  });

  // ------------------------------------------------------------ strategies
  app.get("/api/v1/strategies/templates", (c) =>
    c.json({
      templates: TEMPLATES.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        teaches: template.teaches,
        spec: template.spec,
      })),
    }),
  );

  app.post("/api/v1/strategies/generate", async (c) => {
    const user = c.get("user");
    await enforceRateLimits(c, store, env, {
      keyPrefix: `generate:${user.id}`,
      hourLimit: LIMITS.generationPerHour,
      dayLimit: LIMITS.generationPerDay,
      globalHourLimit: LIMITS.globalGenerationPerHour,
    });
    const body = await readJson(c, generateRequestSchema);
    if (body.prompt.length > LIMITS.maxPromptChars) {
      throw new ApiException(422, "VALIDATION_FAILED", "The prompt is too long.");
    }
    const spend = await store.generationSpendUsd(user.id);
    const estimatedSpend = ai.estimateCost(spend.promptTokens, spend.completionTokens);
    const budgetRemainingUsd = Math.max(0, env.AI_DAILY_COST_CAP_USD - estimatedSpend);
    const outcome = await ai.generate(
      {
        prompt: body.prompt,
        market: { venue: "indodax", symbol: body.symbol, timeframe: body.timeframe },
      },
      { budgetRemainingUsd },
    );
    const result = outcome.result as { status: string; spec?: unknown };
    await store.insertGeneration({
      userId: user.id,
      promptHash: hashObject(body.prompt),
      provider: outcome.meta.provider,
      model: outcome.meta.model,
      schemaVersion: "1.0",
      status: result.status,
      latencyMs: outcome.meta.latencyMs,
      promptTokens: outcome.meta.promptTokens,
      completionTokens: outcome.meta.completionTokens,
    });
    return c.json({ ...(outcome.result as object), generationMeta: outcome.meta });
  });

  app.post("/api/v1/strategies", async (c) => {
    const user = c.get("user");
    const body = await readJson(c, createStrategySchema);
    const strategy = await store.createStrategy({
      userId: user.id,
      name: body.name,
      description: body.description,
    });
    return c.json({ strategy: strategyDto(strategy) }, 201);
  });

  app.get("/api/v1/strategies", async (c) => {
    const user = c.get("user");
    const query = parseQuery(c, paginationSchema);
    const rows = await store.listStrategies({
      userId: user.id,
      limit: Math.min(query.limit, LIMITS.maxStrategiesPage),
      cursor: query.cursor,
      status:
        c.req.query("status") === "archived"
          ? "archived"
          : c.req.query("status") === "active"
            ? "active"
            : undefined,
      query: c.req.query("q")?.slice(0, 100),
    });
    const items = rows.slice(0, query.limit).map(strategyDto);
    const nextCursor =
      rows.length > query.limit ? iso(rows[query.limit - 1]?.updated_at ?? "") : null;
    return c.json({ items, nextCursor });
  });

  app.get("/api/v1/strategies/:strategyId", async (c) => {
    const user = c.get("user");
    const strategy = await store.getStrategyForUser(c.req.param("strategyId"), user.id);
    if (!strategy) throw new ApiException(404, "NOT_FOUND", "Strategy not found.");
    const versions = await store.listVersions(strategy.id);
    return c.json({
      strategy: strategyDto(strategy),
      versions: versions.map(versionDto),
    });
  });

  app.patch("/api/v1/strategies/:strategyId", async (c) => {
    const user = c.get("user");
    const body = await readJson(c, updateStrategySchema);
    const strategy = await store.updateStrategy(c.req.param("strategyId"), user.id, body);
    if (!strategy) throw new ApiException(404, "NOT_FOUND", "Strategy not found.");
    return c.json({ strategy: strategyDto(strategy) });
  });

  app.delete("/api/v1/strategies/:strategyId", async (c) => {
    const user = c.get("user");
    const strategy = await store.updateStrategy(c.req.param("strategyId"), user.id, {
      status: "archived",
    });
    if (!strategy) throw new ApiException(404, "NOT_FOUND", "Strategy not found.");
    return c.json({ strategy: strategyDto(strategy) });
  });

  app.post("/api/v1/strategies/:strategyId/versions", async (c) => {
    const user = c.get("user");
    const strategy = await store.getStrategyForUser(c.req.param("strategyId"), user.id);
    if (!strategy) throw new ApiException(404, "NOT_FOUND", "Strategy not found.");
    const body = await readJson(c, saveVersionSchema);
    const parsed = parseStrategySpec(body.spec);
    if (!parsed.ok) {
      throw new ApiException(
        422,
        "VALIDATION_FAILED",
        "The strategy specification is invalid.",
        parsed.errors,
      );
    }
    const specHash = hashObject(parsed.spec);
    const existingVersions = await store.listVersions(strategy.id);
    const latest = existingVersions[0];
    const idempotencyKey = c.req.header("idempotency-key");
    if (idempotencyKey && latest && latest.spec_hash === specHash) {
      return c.json({ version: versionDto(latest), existing: true });
    }
    const version = await store.createVersion({
      strategyId: strategy.id,
      spec: parsed.spec,
      specHash,
      schemaVersion: parsed.spec.schemaVersion,
      sourcePrompt: body.sourcePrompt ?? null,
      provider: null,
      model: null,
    });
    return c.json({ version: versionDto(version), existing: false }, 201);
  });

  app.get("/api/v1/strategies/:strategyId/versions/:versionId", async (c) => {
    const user = c.get("user");
    const version = await store.getVersionForUser(c.req.param("versionId"), user.id);
    if (!version || version.strategy_id !== c.req.param("strategyId")) {
      throw new ApiException(404, "NOT_FOUND", "Version not found.");
    }
    return c.json({ version: versionDto(version) });
  });

  app.get("/api/v1/strategies/:strategyId/versions/:versionId/compare", async (c) => {
    const user = c.get("user");
    const query = parseQuery(c, compareQuerySchema);
    const strategyId = c.req.param("strategyId");
    const current = await store.getVersionForUser(c.req.param("versionId"), user.id);
    const against = await store.getVersionForUser(query.against, user.id);
    if (
      !current ||
      !against ||
      current.strategy_id !== strategyId ||
      against.strategy_id !== strategyId
    ) {
      throw new ApiException(404, "NOT_FOUND", "Version not found.");
    }
    const currentJob = await store.latestBacktestForVersion(current.id, user.id);
    const againstJob = await store.latestBacktestForVersion(against.id, user.id);
    const currentSummary = currentJob?.summary_json ?? null;
    const againstSummary = againstJob?.summary_json ?? null;
    return c.json({
      current: {
        version: versionDto(current),
        summary: currentSummary,
        config: currentJob?.config_json ?? null,
      },
      against: {
        version: versionDto(against),
        summary: againstSummary,
        config: againstJob?.config_json ?? null,
      },
      sameConfig:
        currentJob && againstJob
          ? hashObject(currentJob.config_json) === hashObject(againstJob.config_json)
          : false,
    });
  });

  app.get("/api/v1/strategies/:strategyId/backtests", async (c) => {
    const user = c.get("user");
    const query = parseQuery(c, paginationSchema);
    const jobs = await store.listBacktestsForStrategy(
      c.req.param("strategyId"),
      user.id,
      Math.min(query.limit, LIMITS.maxTradesPage),
    );
    return c.json({ items: jobs.map(backtestDto), nextCursor: null });
  });

  // ------------------------------------------------------------- backtests
  app.post("/api/v1/backtests", async (c) => {
    const user = c.get("user");
    await enforceRateLimits(c, store, env, {
      keyPrefix: `backtest:${user.id}`,
      hourLimit: LIMITS.backtestsPerHour,
      dayLimit: LIMITS.backtestsPerDay,
      globalHourLimit: LIMITS.globalBacktestsPerHour,
    });
    const body = await readJson(c, submitBacktestSchema);
    const version = await store.getVersionForUser(body.strategyVersionId, user.id);
    if (!version) throw new ApiException(404, "NOT_FOUND", "Strategy version not found.");
    const spec = parseStrategySpec(version.spec_json);
    if (!spec.ok) {
      throw new ApiException(422, "VALIDATION_FAILED", "The saved strategy version is invalid.");
    }
    const config = backtestConfigSchema.parse(body.config);
    const range = validateBacktestRange(config, spec.spec.market.timeframe, maxCandlesFor(env));
    if (!range.ok) {
      throw new ApiException(422, "INSUFFICIENT_DATA", range.message);
    }
    if (env.MARKET_DATA_MODE === "fixture") {
      const coverage = await marketData.coverage();
      const availability = fixtureAvailability(
        coverage,
        spec.spec.market.symbol,
        spec.spec.market.timeframe,
      );
      if (!availability.ok || !availability.coverage) {
        throw new ApiException(
          422,
          "MARKET_DATA_UNAVAILABLE",
          availability.message ?? "Data is not available.",
        );
      }
      const first = Date.parse(config.startTime);
      const last = Date.parse(config.endTime);
      if (
        first < availability.coverage.firstTimestamp ||
        last > availability.coverage.lastTimestamp + 14_400_000
      ) {
        throw new ApiException(
          422,
          "MARKET_DATA_UNAVAILABLE",
          "The selected range is outside the workshop data snapshot.",
        );
      }
    }
    const running = await store.countRunningForUser(user.id);
    if (running >= LIMITS.maxConcurrentJobsPerUser) {
      throw new ApiException(
        429,
        "RATE_LIMITED",
        "You already have a backtest running. Wait for it to finish.",
        undefined,
        5,
      );
    }
    const inserted = await store.insertBacktestJob({
      userId: user.id,
      strategyVersionId: version.id,
      config,
      configHash: configHashFor(config),
      engineVersion: ENGINE_VERSION,
    });
    if (!inserted.existing) {
      await store.enqueueJob({
        name: "backtest.run",
        payload: { backtestJobId: inserted.job.id },
        maxAttempts: 3,
      });
      if (deps.processJob) {
        await deps.processJob(inserted.job.id);
      }
    }
    const latest = (await store.getBacktestForUser(inserted.job.id, user.id)) ?? inserted.job;
    return c.json(
      { backtestId: inserted.job.id, status: latest.status, existing: inserted.existing },
      202,
    );
  });

  app.get("/api/v1/backtests", async (c) => {
    const user = c.get("user");
    const query = parseQuery(c, paginationSchema);
    const rows = await store.listBacktestsForUser({
      userId: user.id,
      limit: query.limit,
      cursor: query.cursor,
    });
    const items = rows.slice(0, query.limit).map(backtestDto);
    const nextCursor =
      rows.length > query.limit ? iso(rows[query.limit - 1]?.created_at ?? "") : null;
    return c.json({ items, nextCursor });
  });

  app.get("/api/v1/backtests/:backtestId", async (c) => {
    const user = c.get("user");
    const job = await store.getBacktestForUser(c.req.param("backtestId"), user.id);
    if (!job) throw new ApiException(404, "NOT_FOUND", "Backtest not found.");
    const version = await store.getVersion(job.strategy_version_id);
    const spec = version?.spec_json ? parseStrategySpec(version.spec_json) : null;
    return c.json({
      backtest: backtestDto(job),
      spec: spec?.ok ? spec.spec : null,
      explanation: spec?.ok ? renderSpec(spec.spec) : null,
      disclosure: SIMULATION_DISCLOSURE,
    });
  });

  app.get("/api/v1/backtests/:backtestId/trades", async (c) => {
    const user = c.get("user");
    const job = await store.getBacktestForUser(c.req.param("backtestId"), user.id);
    if (!job) throw new ApiException(404, "NOT_FOUND", "Backtest not found.");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), LIMITS.maxTradesPage);
    const cursorRaw = c.req.query("cursor");
    const cursor = cursorRaw ? Number(cursorRaw) : undefined;
    if (cursor !== undefined && !Number.isFinite(cursor)) {
      throw new ApiException(422, "VALIDATION_FAILED", "Invalid cursor.");
    }
    const rows = await store.getTrades(job.id, limit, cursor);
    const items = rows.slice(0, limit).map(tradeDto);
    return c.json({
      items,
      nextCursor: rows.length > limit ? String(items.at(-1)?.sequenceNumber ?? "") : null,
    });
  });

  app.get("/api/v1/backtests/:backtestId/equity-curve", async (c) => {
    const user = c.get("user");
    const job = await store.getBacktestForUser(c.req.param("backtestId"), user.id);
    if (!job) throw new ApiException(404, "NOT_FOUND", "Backtest not found.");
    const query = parseQuery(c, equityQuerySchema);
    const rows = await store.getEquity(job.id);
    const points = rows.map((row) => ({
      timestamp: Number(row.timestamp),
      equity: num(row.equity),
      drawdownPct: num(row.drawdown_pct),
    }));
    return c.json({ points: downsample(points, query.maxPoints) });
  });

  app.get("/api/v1/backtests/:backtestId/trades.csv", async (c) => {
    const user = c.get("user");
    const job = await store.getBacktestForUser(c.req.param("backtestId"), user.id);
    if (!job) throw new ApiException(404, "NOT_FOUND", "Backtest not found.");
    const allRows: Array<Record<string, unknown>> = [];
    let tradeCursor: number | undefined;
    for (;;) {
      const page = await store.getTrades(job.id, 100, tradeCursor);
      for (const row of page.slice(0, 100)) allRows.push(row as unknown as Record<string, unknown>);
      if (page.length <= 100) break;
      tradeCursor = allRows.at(-1)?.sequence_number as number;
      if (allRows.length >= 10_000) break;
    }
    const header = [
      "sequence",
      "side",
      "entry_time",
      "exit_time",
      "entry_price",
      "exit_price",
      "quantity",
      "entry_fee",
      "exit_fee",
      "gross_pnl",
      "net_pnl",
      "return_pct",
      "exit_reason",
    ];
    const lines = [header.join(",")];
    for (const row of allRows) {
      const trade = tradeDto(row);
      lines.push(
        [
          trade.sequenceNumber,
          trade.side,
          trade.entryTime,
          trade.exitTime,
          trade.entryPrice,
          trade.exitPrice,
          trade.quantity,
          trade.entryFee,
          trade.exitFee,
          trade.grossPnl,
          trade.netPnl,
          trade.returnPct,
          trade.exitReason,
        ]
          .map((value) => csvCell(value))
          .join(","),
      );
    }
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", `attachment; filename="backtest-${job.id}-trades.csv"`);
    return c.body(lines.join("\n"));
  });

  app.post("/api/v1/backtests/:backtestId/share", async (c) => {
    const user = c.get("user");
    const job = await store.getBacktestForUser(c.req.param("backtestId"), user.id);
    if (!job) throw new ApiException(404, "NOT_FOUND", "Backtest not found.");
    if (job.status !== "COMPLETED") {
      throw new ApiException(409, "CONFLICT", "Only completed backtests can be shared.");
    }
    const body = shareRequestSchema.parse((await c.req.json().catch(() => ({}))) ?? {});
    await store.revokeSharesForJob(job.id);
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);
    await store.createShare({ jobId: job.id, tokenHash: hashToken(token), expiresAt });
    return c.json(
      { url: shareUrl(env.APP_URL, token), token, expiresAt: expiresAt.toISOString() },
      201,
    );
  });

  app.delete("/api/v1/backtests/:backtestId/share", async (c) => {
    const user = c.get("user");
    const job = await store.getBacktestForUser(c.req.param("backtestId"), user.id);
    if (!job) throw new ApiException(404, "NOT_FOUND", "Backtest not found.");
    await store.revokeSharesForJob(job.id);
    return c.json({ revoked: true });
  });

  return app;
}

async function readJson<S extends ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new ApiException(422, "VALIDATION_FAILED", "Request body must be valid JSON.");
  }
  return schema.parse(value);
}

function parseQuery<S extends ZodType>(c: Context, schema: S): z.infer<S> {
  const raw: Record<string, string> = {};
  for (const [key, value] of new URL(c.req.url).searchParams.entries()) raw[key] = value;
  return schema.parse(raw);
}

async function enforceAuthRateLimit(
  c: Context,
  store: Store,
  env: Env,
  scope: string,
): Promise<void> {
  if (!env.RATE_LIMIT_ENABLED) return;
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "local";
  const windowMs = 15 * 60 * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const count = await store.consumeRateLimit(`auth:${scope}:${ip}`, windowStart);
  if (count > LIMITS.authAttemptsPer15Min) {
    throw new ApiException(
      429,
      "RATE_LIMITED",
      "Too many attempts. Try again in 15 minutes.",
      undefined,
      900,
    );
  }
}

async function enforceRateLimits(
  _c: Context,
  store: Store,
  env: Env,
  limits: { keyPrefix: string; hourLimit: number; dayLimit: number; globalHourLimit: number },
): Promise<void> {
  if (!env.RATE_LIMIT_ENABLED) return;
  const now = Date.now();
  const hourWindow = new Date(Math.floor(now / 3_600_000) * 3_600_000);
  const dayWindow = new Date(Math.floor(now / 86_400_000) * 86_400_000);
  const checks = await Promise.all([
    store.consumeRateLimit(`${limits.keyPrefix}:hour`, hourWindow),
    store.consumeRateLimit(`${limits.keyPrefix}:day`, dayWindow),
    store.consumeRateLimit(`global:${limits.keyPrefix.split(":")[0]}:hour`, hourWindow),
  ]);
  if ((checks[0] ?? 0) > limits.hourLimit) {
    throw new ApiException(
      429,
      "RATE_LIMITED",
      "Hourly limit reached. Try again later.",
      undefined,
      3600,
    );
  }
  if ((checks[1] ?? 0) > limits.dayLimit) {
    throw new ApiException(
      429,
      "RATE_LIMITED",
      "Daily limit reached. Try again tomorrow.",
      undefined,
      86_400,
    );
  }
  if ((checks[2] ?? 0) > limits.globalHourLimit) {
    throw new ApiException(
      429,
      "RATE_LIMITED",
      "The workshop is busy. Try again in a few minutes.",
      undefined,
      300,
    );
  }
}

function downsample<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const result: T[] = [];
  for (let index = 0; index < points.length; index += step) result.push(points[index] as T);
  const last = points.at(-1);
  if (last && result.at(-1) !== last) result.push(last);
  return result;
}

type SnapshotManifest = {
  generatedAt: string;
  series: Array<{
    symbol: string;
    timeframe: string;
    gaps: number;
    maxGapCandles: number;
    zeroVolumeCandles: number;
    sha256: string;
    fetchedAt: string;
  }>;
};

function readSnapshotManifest(env: Env): SnapshotManifest | null {
  if (env.MARKET_DATA_MODE !== "fixture") return null;
  const path = join(resolve(env.MARKET_DATA_FIXTURE_DIR), "manifest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SnapshotManifest;
  } catch {
    return null;
  }
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
