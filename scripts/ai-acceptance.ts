import {
  ACCEPTANCE_PROMPTS,
  GenerationService,
  OpenAICompatibleProvider,
  preflightAi,
} from "@quantify/ai";
import { loadConfig, SCHEMA_VERSION } from "@quantify/config";
import { parseStrategySpec } from "@quantify/strategy-spec";
import { writeEvidence } from "./evidence.js";

const env = loadConfig();
const openai =
  env.AI_MODE === "openai-compatible" && env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL
    ? new OpenAICompatibleProvider({
        baseUrl: env.AI_BASE_URL,
        apiKey: env.AI_API_KEY,
        model: env.AI_MODEL,
        timeoutMs: env.AI_TIMEOUT_MS,
        maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
      })
    : undefined;
const service = new GenerationService({
  mode: env.AI_MODE,
  openai,
  inputPricePerMTokUsd: env.AI_INPUT_PRICE_PER_MTOK_USD,
  outputPricePerMTokUsd: env.AI_OUTPUT_PRICE_PER_MTOK_USD,
});
const preflight = await preflightAi(env);

const results = [];
let supported = 0;
let supportedOk = 0;
let fallbackCount = 0;
for (const item of ACCEPTANCE_PROMPTS) {
  const started = performance.now();
  const outcome = await service.generate({
    prompt: item.prompt,
    market: { venue: "indodax", symbol: "BTC/IDR", timeframe: "1h" },
  });
  const latencyMs = Math.round(performance.now() - started);
  const specCheck =
    outcome.result.status === "ok" && outcome.result.spec
      ? parseStrategySpec(outcome.result.spec)
      : null;
  const valid = outcome.result.status !== "ok" || Boolean(specCheck?.ok);
  const matched = outcome.result.status === item.expected;
  if (item.expected === "ok") {
    supported += 1;
    if (matched && valid) supportedOk += 1;
  }
  if (outcome.meta.fallback) fallbackCount += 1;
  results.push({
    id: item.id,
    prompt: item.prompt,
    expected: item.expected,
    actual: outcome.result.status,
    matched,
    validSpec: valid,
    provider: outcome.meta.provider,
    fallback: outcome.meta.fallback,
    fallbackReason: outcome.meta.fallbackReason,
    latencyMs,
    questions: outcome.result.questions ?? [],
    assumptions: outcome.result.assumptions ?? [],
    warnings: outcome.result.warnings ?? [],
    specHash: specCheck?.ok ? specCheck.spec.name : null,
  });
  const marker = matched && valid ? "PASS" : "FAIL";
  console.log(
    `${marker} ${item.id.padEnd(26)} expected=${item.expected.padEnd(20)} actual=${outcome.result.status.padEnd(20)} ${latencyMs}ms${outcome.meta.fallback ? " (fallback)" : ""}`,
  );
}

const validSpecRate = supported === 0 ? 1 : supportedOk / supported;
const allMatched = results.every((item) => item.matched && item.validSpec);
const evidence = {
  generatedAt: new Date().toISOString(),
  schemaVersion: SCHEMA_VERSION,
  mode: env.AI_MODE,
  model: env.AI_MODEL || null,
  preflight,
  supportedPrompts: supported,
  supportedValidSpecs: supportedOk,
  validSpecRate,
  fallbackCount,
  allMatched,
  target: { validSpecRate: 0.9, allStatusesMatch: true },
  passed: validSpecRate >= 0.9 && allMatched,
  results,
};
writeEvidence("ai-acceptance.json", evidence);
console.log(
  `\nValid spec rate: ${(validSpecRate * 100).toFixed(1)}% (${supportedOk}/${supported}); fallbacks=${fallbackCount}; all statuses matched=${allMatched}`,
);
console.log("Wrote docs/evidence/ai-acceptance.json");
if (!evidence.passed) process.exit(1);
