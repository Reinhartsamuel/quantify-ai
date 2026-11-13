import { createHash } from "node:crypto";
import { SCHEMA_VERSION } from "@quantify/config";
import type { GenerationResult } from "@quantify/strategy-spec";
import { parseStrategySpec } from "@quantify/strategy-spec";
import { AIProviderError, type OpenAICompatibleProvider } from "./openai.js";
import type {
  AuditRow,
  GenerationInput,
  GenerationMeta,
  GenerationOutcome,
  StrategyGenerationProvider,
} from "./provider.js";
import { TemplateProvider } from "./template.js";

export type GenerationServiceOptions = {
  mode: "openai-compatible" | "template";
  openai?: OpenAICompatibleProvider;
  template?: StrategyGenerationProvider;
  inputPricePerMTokUsd?: number;
  outputPricePerMTokUsd?: number;
};

export type GenerateOptions = {
  budgetRemainingUsd?: number;
};

export class GenerationService {
  private readonly template: StrategyGenerationProvider;
  constructor(private readonly options: GenerationServiceOptions) {
    this.template = options.template ?? new TemplateProvider();
  }

  async generate(
    input: GenerationInput,
    generateOptions: GenerateOptions = {},
  ): Promise<GenerationOutcome> {
    const started = performance.now();
    if (this.options.mode === "template" || !this.options.openai) {
      const result = await this.template.generate(input);
      return this.finish(result, {
        provider: "template",
        model: null,
        latencyMs: Math.round(performance.now() - started),
        promptTokens: 0,
        completionTokens: 0,
        fallback: this.options.mode === "openai-compatible",
        fallbackReason:
          this.options.mode === "openai-compatible" ? "provider_not_configured" : undefined,
      });
    }

    if (
      generateOptions.budgetRemainingUsd !== undefined &&
      generateOptions.budgetRemainingUsd <= 0
    ) {
      return this.fallback(input, started, "daily_cost_cap");
    }

    try {
      const result = await this.options.openai.generate(input);
      const usage = this.options.openai.lastUsage;
      const cost = this.estimateCost(usage.promptTokens, usage.completionTokens);
      if (
        generateOptions.budgetRemainingUsd !== undefined &&
        cost > generateOptions.budgetRemainingUsd
      ) {
        return this.fallback(input, started, "daily_cost_cap");
      }
      const normalized = this.normalize(result);
      return this.finish(normalized, {
        provider: "openai-compatible",
        model: usage.model || null,
        latencyMs: Math.round(performance.now() - started),
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        fallback: false,
      });
    } catch (error) {
      const reason = error instanceof AIProviderError ? error.code : "provider_error";
      return this.fallback(input, started, reason);
    }
  }

  private async fallback(
    input: GenerationInput,
    started: number,
    reason: string,
  ): Promise<GenerationOutcome> {
    const result = await this.template.generate(input);
    return this.finish(result, {
      provider: "template",
      model: null,
      latencyMs: Math.round(performance.now() - started),
      promptTokens: 0,
      completionTokens: 0,
      fallback: true,
      fallbackReason: reason,
    });
  }

  private normalize(result: GenerationResult): GenerationResult {
    if (result.status !== "ok" || !result.spec) return result;
    const parsed = parseStrategySpec(result.spec);
    if (!parsed.ok) {
      throw new AIProviderError(
        "AI_INVALID_OUTPUT",
        parsed.errors.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
      );
    }
    return { ...result, spec: parsed.spec };
  }

  private finish(result: GenerationResult, meta: GenerationMeta): GenerationOutcome {
    return { result: { ...result, provider: meta.provider as GenerationResult["provider"] }, meta };
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    const inputPrice = this.options.inputPricePerMTokUsd ?? 0;
    const outputPrice = this.options.outputPricePerMTokUsd ?? 0;
    return (promptTokens / 1_000_000) * inputPrice + (completionTokens / 1_000_000) * outputPrice;
  }
}

export function toAuditRow(
  prompt: string,
  outcome: GenerationOutcome,
  statusOverride?: GenerationResult["status"],
): AuditRow {
  return {
    promptHash: createHash("sha256").update(prompt).digest("hex"),
    provider: outcome.meta.provider,
    model: outcome.meta.model,
    schemaVersion: SCHEMA_VERSION,
    status: statusOverride ?? outcome.result.status,
    latencyMs: outcome.meta.latencyMs,
    promptTokens: outcome.meta.promptTokens,
    completionTokens: outcome.meta.completionTokens,
  };
}
