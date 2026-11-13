import { zodToJsonSchema } from "zod-to-json-schema";
import { strategySpecSchema } from "./schema.js";

export function strategySpecJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(strategySpecSchema, {
    name: "StrategySpec",
    $refStrategy: "root",
  }) as Record<string, unknown>;
}
