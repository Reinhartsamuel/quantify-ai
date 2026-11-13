import {
  bollinger,
  crossesAbove,
  crossesBelow,
  ema,
  rsi,
  type Series,
  sma,
} from "@quantify/indicators";
import type { Candle } from "@quantify/market-data";
import type { Condition, Indicator, Operand, StrategySpec } from "@quantify/strategy-spec";
import { assertValidSpec } from "@quantify/strategy-spec";

export type CompiledIndicator = {
  indicator: Indicator;
  series: Record<string, Series>;
};

export type CompiledCondition = {
  evaluate: (index: number) => boolean;
  indicators: string[];
};

export type CompiledStrategy = {
  spec: StrategySpec;
  indicators: Map<string, CompiledIndicator>;
  entry: CompiledCondition;
  exit: CompiledCondition;
  evaluateEntry: (index: number) => boolean;
  evaluateExit: (index: number) => boolean;
  warmupBars: number;
};

export function compileStrategy(specInput: unknown, candles: readonly Candle[]): CompiledStrategy {
  const spec = assertValidSpec(specInput);
  const indicators = new Map<string, CompiledIndicator>();
  let warmupBars = 0;

  for (const indicator of spec.indicators) {
    const sourceValues = candles.map((candle) => candle[indicator.source]);
    let series: Record<string, Series>;
    switch (indicator.type) {
      case "ema":
        series = { value: ema(sourceValues, indicator.period) };
        break;
      case "sma":
        series = { value: sma(sourceValues, indicator.period) };
        break;
      case "rsi":
        series = { value: rsi(sourceValues, indicator.period) };
        break;
      case "bollinger": {
        const bands = bollinger(sourceValues, indicator.period, indicator.stdDev);
        series = {
          value: bands.middle,
          middle: bands.middle,
          upper: bands.upper,
          lower: bands.lower,
        };
        break;
      }
    }
    indicators.set(indicator.id, { indicator, series });
    warmupBars = Math.max(warmupBars, indicator.period);
  }

  const priceValue = (index: number, source: keyof Candle): number | null => {
    const candle = candles[index];
    if (!candle) return null;
    const value = candle[source];
    return typeof value === "number" ? value : null;
  };

  const operandValue = (operand: Operand, index: number): number | null => {
    if ("constant" in operand) return operand.constant;
    if ("price" in operand) return priceValue(index, operand.price);
    const compiled = indicators.get(operand.indicator);
    if (!compiled) return null;
    const output = operand.output ?? "value";
    return compiled.series[output]?.[index] ?? null;
  };

  const compileCondition = (condition: Condition): CompiledCondition => {
    const referenced = new Set<string>();

    // Recursive evaluator keeps the compiled tree allocation-free at runtime.
    const evaluateAt = (node: Condition, index: number): boolean => {
      if ("all" in node) return node.all.every((child) => evaluateAt(child, index));
      if ("any" in node) return node.any.some((child) => evaluateAt(child, index));
      const left = operandValue(node.left, index);
      const right = operandValue(node.right, index);
      if (left === null || right === null) return false;
      if (node.operator === "greater_than") return left > right;
      if (node.operator === "less_than") return left < right;
      if (node.operator === "crosses_above") {
        const previousLeft = operandValue(node.left, index - 1);
        const previousRight = operandValue(node.right, index - 1);
        return crossesAbove(previousLeft, left, previousRight, right);
      }
      const previousLeft = operandValue(node.left, index - 1);
      const previousRight = operandValue(node.right, index - 1);
      return crossesBelow(previousLeft, left, previousRight, right);
    };

    const collect = (node: Condition): void => {
      if ("all" in node) {
        node.all.forEach(collect);
        return;
      }
      if ("any" in node) {
        node.any.forEach(collect);
        return;
      }
      if ("indicator" in node.left) referenced.add(node.left.indicator);
      if ("indicator" in node.right) referenced.add(node.right.indicator);
    };
    collect(condition);

    return {
      evaluate: (index) => evaluateAt(condition, index),
      indicators: [...referenced],
    };
  };

  const entry = compileCondition(spec.entry);
  const exit = compileCondition(spec.exit);
  return {
    spec,
    indicators,
    entry,
    exit,
    evaluateEntry: entry.evaluate,
    evaluateExit: exit.evaluate,
    warmupBars,
  };
}
