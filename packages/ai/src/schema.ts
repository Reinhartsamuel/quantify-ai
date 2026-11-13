import { strategySpecSchema } from "@quantify/strategy-spec";
import { z } from "zod";

export const generationResultSchema = z
  .object({
    status: z.enum(["ok", "needs_clarification", "unsupported"]),
    spec: strategySpecSchema.optional(),
    questions: z.array(z.string().min(1).max(300)).max(3).optional(),
    assumptions: z.array(z.string().min(1).max(500)).max(10).optional(),
    explanation: z.string().max(2_000).optional(),
    warnings: z.array(z.string().min(1).max(500)).max(10).optional(),
    provider: z.enum(["openai-compatible", "template"]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "ok" && !value.spec) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["spec"],
        message: "A valid spec is required when status is ok.",
      });
    }
    if (value.status === "ok" && value.spec) {
      const parsed = strategySpecSchema.safeParse(value.spec);
      if (!parsed.success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["spec"],
          message: parsed.error.issues.map((issue) => issue.message).join("; "),
        });
      }
    }
    if (
      value.status === "needs_clarification" &&
      (!value.questions || value.questions.length === 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions"],
        message: "Clarification requires at least one question.",
      });
    }
    if (value.status === "unsupported" && !value.explanation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["explanation"],
        message: "Unsupported requests require an explanation.",
      });
    }
  });

export type ParsedGenerationResult = z.infer<typeof generationResultSchema>;
