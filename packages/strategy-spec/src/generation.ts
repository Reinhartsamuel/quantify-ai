import type { StrategySpec } from "./schema.js";

export type GenerationStatus = "ok" | "needs_clarification" | "unsupported";

export type GenerationResult = {
  status: GenerationStatus;
  spec?: StrategySpec;
  questions?: string[];
  assumptions?: string[];
  explanation?: string;
  warnings?: string[];
  provider: "openai-compatible" | "template";
};
