import type { GenerationResult } from "@quantify/strategy-spec";
import { zodToJsonSchema } from "zod-to-json-schema";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import type { GenerationInput, StrategyGenerationProvider } from "./provider.js";
import { generationResultSchema } from "./schema.js";

export type AIErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_AUTH_FAILED"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_INVALID_OUTPUT"
  | "AI_COST_CAP";

export class AIProviderError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export type OpenAICompatibleOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  fetchImpl?: typeof fetch;
};

type ChatUsage = { prompt_tokens?: number; completion_tokens?: number };

export class OpenAICompatibleProvider implements StrategyGenerationProvider {
  readonly name = "openai-compatible" as const;
  lastUsage: { promptTokens: number; completionTokens: number; model: string } = {
    promptTokens: 0,
    completionTokens: 0,
    model: "",
  };
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(input: GenerationInput): Promise<GenerationResult> {
    if (!this.options.baseUrl || !this.options.apiKey || !this.options.model) {
      throw new AIProviderError("AI_NOT_CONFIGURED", "AI provider is not configured.");
    }
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: buildUserPrompt({
          prompt: input.prompt,
          symbol: input.market.symbol,
          timeframe: input.market.timeframe,
        }),
      },
    ];
    const first = await this.call(messages, true);
    const parsed = this.parse(first.content);
    if (parsed) return { ...parsed, provider: "openai-compatible" };

    const repairMessages = [
      ...messages,
      { role: "assistant", content: first.content.slice(0, 8_000) },
      {
        role: "user",
        content: `The previous JSON did not validate: ${parsed === null ? "invalid JSON or generation envelope" : "invalid result"}. Return corrected JSON only. Do not add facts that were not in the user description; use assumptions for defaults and clarification for missing essentials.`,
      },
    ];
    const repaired = await this.call(repairMessages, false);
    const repairedParsed = this.parse(repaired.content);
    if (repairedParsed) return { ...repairedParsed, provider: "openai-compatible" };
    throw new AIProviderError(
      "AI_INVALID_OUTPUT",
      "The AI provider did not return a valid strategy specification.",
      true,
    );
  }

  private parse(content: string): GenerationResult | null {
    const trimmed = content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
    const result = generationResultSchema.safeParse(value);
    if (!result.success) return null;
    const parsed = result.data;
    return {
      status: parsed.status,
      spec: parsed.spec,
      questions: parsed.questions,
      assumptions: parsed.assumptions,
      explanation: parsed.explanation,
      warnings: parsed.warnings,
      provider: "openai-compatible",
    };
  }

  private async call(
    messages: Array<{ role: string; content: string }>,
    allowJsonSchema: boolean,
  ): Promise<{ content: string }> {
    const body: Record<string, unknown> = {
      model: this.options.model,
      temperature: 0,
      max_tokens: this.options.maxOutputTokens,
      messages,
    };
    if (allowJsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: "strategy_generation",
          strict: true,
          schema: zodToJsonSchema(generationResultSchema, {
            name: "StrategyGeneration",
            $refStrategy: "root",
          }),
        },
      };
    } else {
      body.response_format = { type: "json_object" };
    }

    const response = await this.request(body);
    if (response.status === 400 && allowJsonSchema) {
      return this.call(messages, false);
    }
    if (response.status === 401 || response.status === 403) {
      throw new AIProviderError("AI_AUTH_FAILED", "The AI provider rejected the API key.");
    }
    if (response.status === 429) {
      throw new AIProviderError("AI_RATE_LIMITED", "The AI provider rate limit was reached.", true);
    }
    if (!response.ok) {
      throw new AIProviderError(
        "AI_PROVIDER_UNAVAILABLE",
        "The AI provider is temporarily unavailable.",
        response.status >= 500,
      );
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: ChatUsage;
      model?: string;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new AIProviderError("AI_INVALID_OUTPUT", "The AI provider returned no content.", true);
    }
    this.lastUsage = {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      model: payload.model ?? this.options.model,
    };
    return { content };
  }

  private async request(body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      return await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AIProviderError("AI_TIMEOUT", "The AI provider request timed out.", true);
      }
      throw new AIProviderError(
        "AI_PROVIDER_UNAVAILABLE",
        "Could not reach the AI provider.",
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
