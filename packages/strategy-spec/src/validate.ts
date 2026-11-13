import { CONDITION_BOUNDS } from "@quantify/config";
import type {
  Condition,
  Indicator,
  Operand,
  ParsedSpec,
  SpecIssue,
  StrategySpec,
} from "./schema.js";
import { strategySpecSchema } from "./schema.js";

const outputByType: Record<Indicator["type"], readonly string[]> = {
  ema: ["value"],
  sma: ["value"],
  rsi: ["value"],
  bollinger: ["value", "upper", "middle", "lower"],
};

function walkCondition(
  condition: Condition,
  path: string,
  depth: number,
  visit: (
    condition: Exclude<Condition, { all: Condition[] } | { any: Condition[] }>,
    path: string,
  ) => void,
): { nodes: number; maxDepth: number } {
  if ("all" in condition) {
    const children = condition.all;
    let nodes = 0;
    let maxDepth = depth;
    if (children.length === 0) {
      throw new Error(`${path}.all must contain at least one condition`);
    }
    children.forEach((child, index) => {
      const result = walkCondition(child, `${path}.all[${index}]`, depth + 1, visit);
      nodes += result.nodes;
      maxDepth = Math.max(maxDepth, result.maxDepth);
    });
    return { nodes, maxDepth };
  }
  if ("any" in condition) {
    const children = condition.any;
    let nodes = 0;
    let maxDepth = depth;
    if (children.length === 0) {
      throw new Error(`${path}.any must contain at least one condition`);
    }
    children.forEach((child, index) => {
      const result = walkCondition(child, `${path}.any[${index}]`, depth + 1, visit);
      nodes += result.nodes;
      maxDepth = Math.max(maxDepth, result.maxDepth);
    });
    return { nodes, maxDepth };
  }
  visit(condition, path);
  return { nodes: 1, maxDepth: depth };
}

function operandLabel(operand: Operand, indicators: Map<string, Indicator>): string {
  if ("price" in operand) return `the ${operand.price} price`;
  if ("constant" in operand) return String(operand.constant);
  const indicator = indicators.get(operand.indicator);
  if (!indicator) return operand.indicator;
  const label = `${indicator.type.toUpperCase()}(${indicator.period})`;
  const output = operand.output && operand.output !== "value" ? ` ${operand.output}` : "";
  return `${label}${output} of ${indicator.source}`;
}

function conditionLabel(condition: Condition, indicators: Map<string, Indicator>): string {
  if ("all" in condition) {
    return condition.all.map((child) => conditionLabel(child, indicators)).join(" and ");
  }
  if ("any" in condition) {
    return `(${condition.any.map((child) => conditionLabel(child, indicators)).join(" or ")})`;
  }
  const left = operandLabel(condition.left, indicators);
  const right = operandLabel(condition.right, indicators);
  switch (condition.operator) {
    case "greater_than":
      return `${left} is greater than ${right}`;
    case "less_than":
      return `${left} is less than ${right}`;
    case "crosses_above":
      return `${left} crosses above ${right}`;
    case "crosses_below":
      return `${left} crosses below ${right}`;
  }
}

export class SpecValidationError extends Error {
  readonly issues: SpecIssue[];
  constructor(issues: SpecIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "SpecValidationError";
    this.issues = issues;
  }
}

export function validateSpecSemantics(spec: StrategySpec): SpecIssue[] {
  const errors: SpecIssue[] = [];
  const indicators = new Map<string, Indicator>();
  spec.indicators.forEach((indicator, index) => {
    const path = `indicators[${index}].id`;
    if (indicators.has(indicator.id)) {
      errors.push({
        path,
        code: "DUPLICATE_INDICATOR_ID",
        message: `Indicator id "${indicator.id}" is used more than once.`,
      });
    }
    indicators.set(indicator.id, indicator);
  });

  const rsiValues = new Set<string>();
  for (const indicator of indicators.values()) {
    if (indicator.type === "rsi") rsiValues.add(indicator.id);
  }

  const validateCondition = (condition: Condition, path: string) => {
    if ("all" in condition) {
      condition.all.forEach((child, index) => validateCondition(child, `${path}.all[${index}]`));
      return;
    }
    if ("any" in condition) {
      condition.any.forEach((child, index) => validateCondition(child, `${path}.any[${index}]`));
      return;
    }
    for (const side of ["left", "right"] as const) {
      const operand = condition[side];
      if ("indicator" in operand) {
        const indicator = indicators.get(operand.indicator);
        if (!indicator) {
          errors.push({
            path: `${path}.${side}.indicator`,
            code: "UNKNOWN_INDICATOR",
            message: `Indicator "${operand.indicator}" is not defined.`,
          });
          continue;
        }
        const allowed = outputByType[indicator.type];
        const output = operand.output ?? "value";
        if (!allowed.includes(output)) {
          errors.push({
            path: `${path}.${side}.output`,
            code: "INVALID_INDICATOR_OUTPUT",
            message: `${indicator.type} does not support output "${output}". Allowed: ${allowed.join(", ")}.`,
          });
        }
        if (
          indicator.type === "rsi" &&
          condition.operator !== "crosses_above" &&
          condition.operator !== "crosses_below"
        ) {
          const other = condition[side === "left" ? "right" : "left"];
          if ("constant" in other && (other.constant < 0 || other.constant > 100)) {
            errors.push({
              path: `${path}.${side === "left" ? "right" : "left"}.constant`,
              code: "RSI_THRESHOLD_RANGE",
              message: "RSI thresholds must be between 0 and 100.",
            });
          }
        }
      }
    }

    if (condition.operator === "crosses_above" || condition.operator === "crosses_below") {
      const left =
        "indicator" in condition.left ? indicators.get(condition.left.indicator) : undefined;
      const right =
        "indicator" in condition.right ? indicators.get(condition.right.indicator) : undefined;
      if (
        left &&
        right &&
        left.type === right.type &&
        left.type !== "rsi" &&
        left.type !== "bollinger"
      ) {
        if (left.period >= right.period) {
          errors.push({
            path,
            code: "CROSSOVER_PERIOD_ORDER",
            message: `For a crossover, the left ${left.type.toUpperCase()} period (${left.period}) must be shorter than the right period (${right.period}).`,
          });
        }
      }
      if (
        "constant" in condition.left ||
        "constant" in condition.right ||
        ("price" in condition.left && "price" in condition.right)
      ) {
        if (!("constant" in condition.left && "constant" in condition.right)) {
          // Crossing a price or constant is supported; only constant-vs-constant is meaningless.
        }
      }
      if ("constant" in condition.left && "constant" in condition.right) {
        errors.push({
          path,
          code: "CONSTANT_CROSSOVER",
          message: "A crossover between two constants never changes and is not supported.",
        });
      }
    }
  };

  try {
    const entryStats = walkCondition(spec.entry, "entry", 1, validateCondition);
    const exitStats = walkCondition(spec.exit, "exit", 1, validateCondition);
    const nodes = entryStats.nodes + exitStats.nodes;
    const maxDepth = Math.max(entryStats.maxDepth, exitStats.maxDepth);
    if (nodes > CONDITION_BOUNDS.maxNodes) {
      errors.push({
        path: "entry",
        code: "CONDITION_NODE_LIMIT",
        message: `Combined condition nodes (${nodes}) exceed the limit of ${CONDITION_BOUNDS.maxNodes}.`,
      });
    }
    if (maxDepth > CONDITION_BOUNDS.maxDepth) {
      errors.push({
        path: "entry",
        code: "CONDITION_DEPTH_LIMIT",
        message: `Condition depth (${maxDepth}) exceeds the limit of ${CONDITION_BOUNDS.maxDepth}.`,
      });
    }
  } catch (error) {
    errors.push({
      path: "entry",
      code: "EMPTY_CONDITION",
      message: error instanceof Error ? error.message : "Condition tree is empty.",
    });
  }

  if (spec.risk.positionSizing.value > 100) {
    errors.push({
      path: "risk.positionSizing.value",
      code: "POSITION_SIZE_RANGE",
      message: "Position size must be between 1 and 100 percent of equity.",
    });
  }

  return errors;
}

export function parseStrategySpec(input: unknown): ParsedSpec {
  const parsed = strategySpecSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "(root)",
        code: "SCHEMA_VALIDATION",
        message: issue.message,
      })),
    };
  }
  const semantic = validateSpecSemantics(parsed.data);
  if (semantic.length > 0) return { ok: false, errors: semantic };
  return {
    ok: true,
    spec: parsed.data,
    validation: { valid: true, errors: [], warnings: [] },
  };
}

export function assertValidSpec(input: unknown): StrategySpec {
  const parsed = parseStrategySpec(input);
  if (!parsed.ok) throw new SpecValidationError(parsed.errors);
  return parsed.spec;
}

export function renderSpec(spec: StrategySpec): {
  entry: string;
  exit: string;
  risk: string;
  indicators: string[];
  summary: string;
} {
  const indicators = new Map(spec.indicators.map((indicator) => [indicator.id, indicator]));
  const indicatorLines = spec.indicators.map((indicator) => {
    const output =
      indicator.type === "bollinger"
        ? `Bollinger(${indicator.period}, ${indicator.stdDev}σ)`
        : `${indicator.type.toUpperCase()}(${indicator.period})`;
    return `${indicator.id}: ${output} of ${indicator.source}`;
  });
  const riskParts = [
    `Allocate ${spec.risk.positionSizing.value}% of current equity per position`,
    spec.risk.stopLossPct === null ? null : `stop loss at ${spec.risk.stopLossPct}%`,
    spec.risk.takeProfitPct === null ? null : `take profit at ${spec.risk.takeProfitPct}%`,
  ].filter(Boolean);
  return {
    entry: conditionLabel(spec.entry, indicators),
    exit: conditionLabel(spec.exit, indicators),
    risk: `${riskParts.join(", ")}. Maximum one open position.`,
    indicators: indicatorLines,
    summary: `Buy ${spec.market.symbol} on ${spec.market.timeframe} when ${conditionLabel(
      spec.entry,
      indicators,
    )}; exit when ${conditionLabel(spec.exit, indicators)}.`,
  };
}
