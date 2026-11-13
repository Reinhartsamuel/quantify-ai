import { describe, expect, it } from "vitest";
import type { StrategySpec } from "./index.js";
import { parseStrategySpec, renderSpec, TEMPLATES, validateSpecSemantics } from "./index.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const base = clone(TEMPLATES[0]?.spec as StrategySpec);

describe("StrategySpec v1", () => {
  it("accepts all shipped templates", () => {
    for (const template of TEMPLATES) {
      const parsed = parseStrategySpec(template.spec);
      expect(parsed.ok, template.id).toBe(true);
    }
  });

  it("rejects unknown keys", () => {
    const spec = clone(base) as StrategySpec & { extra?: boolean };
    spec.extra = true;
    const parsed = parseStrategySpec(spec);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors[0]?.code).toBe("SCHEMA_VALIDATION");
  });

  it("rejects duplicate indicator ids", () => {
    const spec = clone(base);
    spec.indicators.push({ ...spec.indicators[0]! });
    const errors = validateSpecSemantics(spec);
    expect(errors.some((error) => error.code === "DUPLICATE_INDICATOR_ID")).toBe(true);
  });

  it("rejects references to missing indicators", () => {
    const spec = clone(base);
    spec.entry = {
      operator: "greater_than",
      left: { indicator: "missing" },
      right: { constant: 1 },
    };
    const parsed = parseStrategySpec(spec);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(parsed.errors.some((error) => error.code === "UNKNOWN_INDICATOR")).toBe(true);
  });

  it("rejects an RSI threshold outside 0-100", () => {
    const spec = clone(base);
    spec.indicators = [{ id: "rsi", type: "rsi", source: "close", period: 14 }];
    spec.entry = { operator: "greater_than", left: { indicator: "rsi" }, right: { constant: 120 } };
    spec.exit = { operator: "less_than", left: { indicator: "rsi" }, right: { constant: 40 } };
    const parsed = parseStrategySpec(spec);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(parsed.errors.some((error) => error.code === "RSI_THRESHOLD_RANGE")).toBe(true);
  });

  it("rejects slow-fast order in a crossover", () => {
    const spec = clone(base);
    spec.indicators = [
      { id: "ema_fast", type: "ema", source: "close", period: 50 },
      { id: "ema_slow", type: "ema", source: "close", period: 20 },
    ];
    const parsed = parseStrategySpec(spec);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(parsed.errors.some((error) => error.code === "CROSSOVER_PERIOD_ORDER")).toBe(true);
  });

  it("rejects out-of-bounds risk values at the schema layer", () => {
    const spec = clone(base);
    spec.risk.positionSizing.value = 0;
    const parsed = parseStrategySpec(spec);
    expect(parsed.ok).toBe(false);
  });

  it("rejects unsupported market values", () => {
    const spec = clone(base);
    spec.market.symbol = "DOGE/IDR" as StrategySpec["market"]["symbol"];
    const parsed = parseStrategySpec(spec);
    expect(parsed.ok).toBe(false);
  });

  it("renders plain-language entry, exit, and risk", () => {
    const rendered = renderSpec(base);
    expect(rendered.entry).toContain("crosses above");
    expect(rendered.exit).toContain("crosses below");
    expect(rendered.risk).toContain("Maximum one open position");
    expect(rendered.indicators[0]).toContain("EMA(20)");
  });

  it("rejects an empty composition at the schema layer", () => {
    const spec = clone(base);
    spec.entry = { all: [] };
    const parsed = parseStrategySpec(spec);
    expect(parsed.ok).toBe(false);
  });

  it("rejects a condition tree deeper than three levels", () => {
    const spec = clone(base);
    spec.entry = {
      all: [
        {
          all: [
            {
              all: [
                {
                  operator: "greater_than",
                  left: { price: "close" },
                  right: { constant: 1 },
                },
              ],
            },
          ],
        },
      ],
    };
    const parsed = parseStrategySpec(spec);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(parsed.errors.some((error) => error.code === "CONDITION_DEPTH_LIMIT")).toBe(true);
  });
});
