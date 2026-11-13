import type { Env } from "@quantify/config";

export type PreflightCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type PreflightReport = {
  ok: boolean;
  mode: Env["AI_MODE"];
  checks: PreflightCheck[];
};

export async function preflightAi(
  env: Env,
  options: { probe?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  const mode = env.AI_MODE;
  checks.push({
    name: "mode",
    ok: true,
    detail:
      mode === "template"
        ? "Template mode: deterministic fallback is active and no network is required."
        : "OpenAI-compatible mode with template fallback on failure.",
  });

  if (mode === "openai-compatible") {
    checks.push({
      name: "AI_BASE_URL",
      ok: /^https?:\/\//.test(env.AI_BASE_URL),
      detail: env.AI_BASE_URL ? "Base URL is set." : "AI_BASE_URL is missing.",
    });
    checks.push({
      name: "AI_API_KEY",
      ok: env.AI_API_KEY.length > 8,
      detail: env.AI_API_KEY ? "API key is present." : "AI_API_KEY is missing.",
    });
    checks.push({
      name: "AI_MODEL",
      ok: env.AI_MODEL.length > 0,
      detail: env.AI_MODEL ? `Model: ${env.AI_MODEL}` : "AI_MODEL is missing.",
    });
    checks.push({
      name: "limits",
      ok: env.AI_TIMEOUT_MS >= 1_000 && env.AI_MAX_OUTPUT_TOKENS >= 256,
      detail: `timeout=${env.AI_TIMEOUT_MS}ms, max_output_tokens=${env.AI_MAX_OUTPUT_TOKENS}, daily_cost_cap=$${env.AI_DAILY_COST_CAP_USD}`,
    });
    if (options.probe) {
      try {
        const response = await (options.fetchImpl ?? fetch)(
          `${env.AI_BASE_URL.replace(/\/$/, "")}/models`,
          {
            headers: { authorization: `Bearer ${env.AI_API_KEY}` },
            signal: AbortSignal.timeout(Math.min(env.AI_TIMEOUT_MS, 10_000)),
          },
        );
        checks.push({
          name: "provider_probe",
          ok: response.ok,
          detail: response.ok
            ? "Provider responded to the models endpoint."
            : `Provider returned HTTP ${response.status}. Template fallback remains available.`,
        });
      } catch {
        checks.push({
          name: "provider_probe",
          ok: false,
          detail: "Provider probe failed. Template fallback remains available.",
        });
      }
    }
  }

  checks.push({
    name: "template_fallback",
    ok: true,
    detail: "Deterministic templates cover EMA, SMA, RSI, and Bollinger strategies.",
  });
  return { ok: checks.every((check) => check.ok), mode, checks };
}
