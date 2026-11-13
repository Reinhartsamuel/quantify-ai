import type { GenerationResult, Market, StrategySpec } from "@quantify/strategy-spec";

export type GenerationInput = {
  prompt: string;
  market: Pick<Market, "venue" | "symbol" | "timeframe">;
};

export interface StrategyGenerationProvider {
  readonly name: "openai-compatible" | "template";
  generate(input: GenerationInput): Promise<GenerationResult>;
}

export type GenerationMeta = {
  provider: string;
  model: string | null;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  fallback: boolean;
  fallbackReason?: string;
};

export type GenerationOutcome = {
  result: GenerationResult;
  meta: GenerationMeta;
};

export type AuditRow = {
  promptHash: string;
  provider: string;
  model: string | null;
  schemaVersion: string;
  status: GenerationResult["status"];
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
};

export type { GenerationResult, StrategySpec };
