import { describe, expect, it } from "vitest";
import { demoConfig, emaSpec, makeTestApp, signUp } from "./helpers.js";

describe("API product loop", () => {
  it("signs up, creates a version, runs a backtest, and serves results", async () => {
    const { app, store, client } = await makeTestApp();
    try {
      const session = await signUp(app);

      const create = await app.request("/api/v1/strategies", {
        method: "POST",
        headers: session.headers,
        body: JSON.stringify({ name: "Workshop strategy", description: "Demo" }),
      });
      expect(create.status).toBe(201);
      const strategyId = ((await create.json()) as { strategy: { id: string } }).strategy.id;

      const save = await app.request(`/api/v1/strategies/${strategyId}/versions`, {
        method: "POST",
        headers: { ...session.headers, "idempotency-key": "demo-1" },
        body: JSON.stringify({ spec: emaSpec, sourcePrompt: "EMA 5/10 test" }),
      });
      expect(save.status).toBe(201);
      const version = ((await save.json()) as { version: { id: string; versionNumber: number } })
        .version;
      expect(version.versionNumber).toBe(1);

      const duplicate = await app.request(`/api/v1/strategies/${strategyId}/versions`, {
        method: "POST",
        headers: { ...session.headers, "idempotency-key": "demo-1" },
        body: JSON.stringify({ spec: emaSpec, sourcePrompt: "EMA 5/10 test" }),
      });
      expect(duplicate.status).toBe(200);
      expect(((await duplicate.json()) as { existing: boolean }).existing).toBe(true);

      const submit = await app.request("/api/v1/backtests", {
        method: "POST",
        headers: session.headers,
        body: JSON.stringify({ strategyVersionId: version.id, config: demoConfig }),
      });
      expect(submit.status).toBe(202);
      const submitted = (await submit.json()) as { backtestId: string; status: string };
      expect(submitted.status).toBe("COMPLETED");

      const again = await app.request("/api/v1/backtests", {
        method: "POST",
        headers: session.headers,
        body: JSON.stringify({ strategyVersionId: version.id, config: demoConfig }),
      });
      expect(again.status).toBe(202);
      expect(((await again.json()) as { existing: boolean }).existing).toBe(true);

      const detail = await app.request(`/api/v1/backtests/${submitted.backtestId}`, {
        headers: session.headers,
      });
      expect(detail.status).toBe(200);
      const detailBody = (await detail.json()) as {
        backtest: { status: string; summary: { totalTrades: number; endingEquity: number } };
        disclosure: string;
      };
      expect(detailBody.backtest.status).toBe("COMPLETED");
      expect(detailBody.backtest.summary.totalTrades).toBeGreaterThan(0);
      expect(detailBody.disclosure).toContain("Not investment advice");

      const trades = await app.request(
        `/api/v1/backtests/${submitted.backtestId}/trades?limit=10`,
        { headers: session.headers },
      );
      expect(trades.status).toBe(200);
      const tradesBody = (await trades.json()) as { items: Array<{ sequenceNumber: number }> };
      expect(tradesBody.items.length).toBeGreaterThan(0);
      expect(tradesBody.items[0]?.sequenceNumber).toBe(1);

      const equity = await app.request(
        `/api/v1/backtests/${submitted.backtestId}/equity-curve?maxPoints=200`,
        { headers: session.headers },
      );
      expect(equity.status).toBe(200);
      const equityBody = (await equity.json()) as { points: unknown[] };
      expect(equityBody.points.length).toBeGreaterThan(10);

      const csv = await app.request(`/api/v1/backtests/${submitted.backtestId}/trades.csv`, {
        headers: session.headers,
      });
      expect(csv.status).toBe(200);
      expect(csv.headers.get("content-type")).toContain("text/csv");
      expect(await csv.text()).toContain("sequence,side,entry_time");

      const share = await app.request(`/api/v1/backtests/${submitted.backtestId}/share`, {
        method: "POST",
        headers: session.headers,
        body: JSON.stringify({ expiresInDays: 7 }),
      });
      expect(share.status).toBe(201);
      const shareBody = (await share.json()) as { token: string; url: string };
      const publicResult = await app.request(`/api/share/${shareBody.token}`);
      expect(publicResult.status).toBe(200);
      const publicBody = (await publicResult.json()) as {
        result: { id: string };
        disclosure: string;
      };
      expect(publicBody.result.id).toBe(submitted.backtestId);
      expect(publicBody.disclosure).toContain("Simulated");

      const badShare = await app.request("/api/share/not-a-real-token");
      expect(badShare.status).toBe(404);

      const audit = await store.client.query<{ prompt_hash: string }>(
        "SELECT prompt_hash FROM strategy_generations",
      );
      expect(audit).toHaveLength(0); // no generation call in this test
    } finally {
      await client.close();
    }
  });

  it("enforces ownership and section access", async () => {
    const { app, client } = await makeTestApp();
    try {
      const owner = await signUp(app);
      const other = await signUp(app);
      const create = await app.request("/api/v1/strategies", {
        method: "POST",
        headers: owner.headers,
        body: JSON.stringify({ name: "Private strategy", description: "" }),
      });
      const strategyId = ((await create.json()) as { strategy: { id: string } }).strategy.id;

      expect(
        (await app.request(`/api/v1/strategies/${strategyId}`, { headers: other.headers })).status,
      ).toBe(404);
      expect((await app.request("/api/v1/strategies")).status).toBe(401);
      expect(
        (
          await app.request(`/api/v1/strategies/${strategyId}/versions`, {
            method: "POST",
            headers: other.headers,
            body: JSON.stringify({ spec: emaSpec }),
          })
        ).status,
      ).toBe(404);

      const save = await app.request(`/api/v1/strategies/${strategyId}/versions`, {
        method: "POST",
        headers: owner.headers,
        body: JSON.stringify({ spec: emaSpec }),
      });
      const versionId = ((await save.json()) as { version: { id: string } }).version.id;
      expect(
        (
          await app.request(`/api/v1/strategies/${strategyId}/versions/${versionId}`, {
            headers: other.headers,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await app.request(
            `/api/v1/strategies/${strategyId}/versions/${versionId}/compare?against=${versionId}`,
            { headers: other.headers },
          )
        ).status,
      ).toBe(404);
      const submit = await app.request("/api/v1/backtests", {
        method: "POST",
        headers: owner.headers,
        body: JSON.stringify({ strategyVersionId: versionId, config: demoConfig }),
      });
      const backtestId = ((await submit.json()) as { backtestId: string }).backtestId;
      expect(
        (await app.request(`/api/v1/backtests/${backtestId}`, { headers: other.headers })).status,
      ).toBe(404);
      expect(
        (await app.request(`/api/v1/backtests/${backtestId}/trades`, { headers: other.headers }))
          .status,
      ).toBe(404);
      expect(
        (
          await app.request(`/api/v1/backtests/${backtestId}/share`, {
            method: "POST",
            headers: other.headers,
            body: "{}",
          })
        ).status,
      ).toBe(404);

      const archive = await app.request(`/api/v1/strategies/${strategyId}`, {
        method: "DELETE",
        headers: owner.headers,
      });
      expect(archive.status).toBe(200);
      const archived = (await archive.json()) as { strategy: { status: string } };
      expect(archived.strategy.status).toBe("archived");
      expect(
        (await app.request(`/api/v1/strategies/${strategyId}`, { headers: owner.headers })).status,
      ).toBe(200);
    } finally {
      await client.close();
    }
  });

  it("rejects CSRF, untrusted origins, oversized input, and bad ranges", async () => {
    const { app, client } = await makeTestApp();
    try {
      const session = await signUp(app);
      const noCsrf = await app.request("/api/v1/strategies", {
        method: "POST",
        headers: { cookie: session.cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "No CSRF", description: "" }),
      });
      expect(noCsrf.status).toBe(403);

      const evil = await app.request("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ email: "user@example.com", password: "correct-horse-battery" }),
      });
      expect(evil.status).toBe(403);

      const longPrompt = await app.request("/api/v1/strategies/generate", {
        method: "POST",
        headers: session.headers,
        body: JSON.stringify({
          prompt: "x".repeat(4_500),
          symbol: "BTC/IDR",
          timeframe: "1h",
        }),
      });
      expect(longPrompt.status).toBe(422);

      const pagination = await app.request("/api/v1/strategies?limit=1000", {
        headers: session.headers,
      });
      expect(pagination.status).toBe(422);

      const create = await app.request("/api/v1/strategies", {
        method: "POST",
        headers: session.headers,
        body: JSON.stringify({ name: "Range test", description: "" }),
      });
      const strategyId = ((await create.json()) as { strategy: { id: string } }).strategy.id;
      const save = await app.request(`/api/v1/strategies/${strategyId}/versions`, {
        method: "POST",
        headers: session.headers,
        body: JSON.stringify({ spec: emaSpec }),
      });
      const versionId = ((await save.json()) as { version: { id: string } }).version.id;
      const tooLong = await app.request("/api/v1/backtests", {
        method: "POST",
        headers: session.headers,
        body: JSON.stringify({
          strategyVersionId: versionId,
          config: {
            ...demoConfig,
            startTime: "2020-01-01T00:00:00.000Z",
            endTime: "2026-01-01T00:00:00.000Z",
          },
        }),
      });
      expect(tooLong.status).toBe(422);
      expect(((await tooLong.json()) as { error: { code: string } }).error.code).toBe(
        "INSUFFICIENT_DATA",
      );
    } finally {
      await client.close();
    }
  });

  it("generates with the template provider and audits hashes only", async () => {
    const { app, store, client } = await makeTestApp();
    try {
      const session = await signUp(app);
      const response = await app.request("/api/v1/strategies/generate", {
        method: "POST",
        headers: session.headers,
        body: JSON.stringify({
          prompt: "Buy BTC when the 20 EMA crosses above the 50 EMA and sell on the reverse cross.",
          symbol: "BTC/IDR",
          timeframe: "1h",
        }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        status: string;
        provider: string;
        generationMeta: { provider: string; fallback: boolean };
      };
      expect(body.status).toBe("ok");
      expect(body.provider).toBe("template");
      const audit = await store.client.query<{ prompt_hash: string; status: string }>(
        "SELECT prompt_hash, status FROM strategy_generations",
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]?.prompt_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(audit[0]?.prompt_hash).not.toContain("EMA");
    } finally {
      await client.close();
    }
  });

  it("reports health, readiness, data coverage, and security headers", async () => {
    const { app, client } = await makeTestApp();
    try {
      const health = await app.request("/api/health");
      expect(health.status).toBe(200);
      expect(health.headers.get("x-content-type-options")).toBe("nosniff");
      expect(health.headers.get("x-frame-options")).toBe("DENY");
      expect(health.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(health.headers.get("x-request-id")).toBeTruthy();

      const ready = await app.request("/api/ready");
      expect([200, 503]).toContain(ready.status);

      const coverage = await app.request("/api/health/market-data");
      const coverageBody = (await coverage.json()) as {
        series: Array<{ symbol: string; timeframe: string; cached: unknown }>;
      };
      const btc1h = coverageBody.series.find(
        (entry) => entry.symbol === "BTC/IDR" && entry.timeframe === "1h",
      );
      expect(btc1h?.cached).not.toBeNull();
    } finally {
      await client.close();
    }
  });

  it("enforces per-user generation rate limits", async () => {
    const { app, client } = await makeTestApp({ env: { RATE_LIMIT_ENABLED: "true" } });
    try {
      const session = await signUp(app);
      const statuses: number[] = [];
      for (let index = 0; index < 6; index += 1) {
        const response = await app.request("/api/v1/strategies/generate", {
          method: "POST",
          headers: session.headers,
          body: JSON.stringify({
            prompt: "Buy BTC when the 20 EMA crosses above the 50 EMA.",
            symbol: "BTC/IDR",
            timeframe: "1h",
          }),
        });
        statuses.push(response.status);
      }
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses[5]).toBe(429);
    } finally {
      await client.close();
    }
  });
});
