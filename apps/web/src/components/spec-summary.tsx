import type { ConditionLike, StrategySpecLike } from "@/lib/api";

type Indicator = { id: string; type: string; source?: string; period?: number; stdDev?: number };
type Operand = { price?: string; indicator?: string; output?: string; constant?: number };

function operandText(operand: Operand | undefined, spec: StrategySpecLike): string {
  if (!operand) return "…";
  if (operand.price) return `the ${operand.price} price`;
  if (operand.constant !== undefined) return String(operand.constant);
  if (operand.indicator) {
    const indicator = (spec.indicators as unknown as Indicator[]).find(
      (item) => item.id === operand.indicator,
    );
    if (!indicator) return operand.indicator;
    const label =
      indicator.type === "bollinger"
        ? `Bollinger(${indicator.period}, ${indicator.stdDev}σ)`
        : `${indicator.type.toUpperCase()}(${indicator.period})`;
    const output = operand.output && operand.output !== "value" ? ` ${operand.output}` : "";
    return `${label}${output}`;
  }
  return "…";
}

const operators: Record<string, string> = {
  greater_than: "is greater than",
  less_than: "is less than",
  crosses_above: "crosses above",
  crosses_below: "crosses below",
};

export function conditionText(condition: ConditionLike, spec: StrategySpecLike): string {
  if (Array.isArray((condition as { all?: unknown }).all)) {
    const children = (condition as { all: ConditionLike[] }).all;
    return children.map((child) => conditionText(child, spec)).join(" and ");
  }
  if (Array.isArray((condition as { any?: unknown }).any)) {
    const children = (condition as { any: ConditionLike[] }).any;
    return `(${children.map((child) => conditionText(child, spec)).join(" or ")})`;
  }
  const leaf = condition as { operator?: string; left?: Operand; right?: Operand };
  return `${operandText(leaf.left, spec)} ${operators[leaf.operator ?? ""] ?? "compares with"} ${operandText(
    leaf.right,
    spec,
  )}`;
}

export function SpecSummary({ spec }: { spec: StrategySpecLike }) {
  const risk = spec.risk;
  const parts = [
    `Allocate ${risk.positionSizing.value}% of current equity`,
    risk.stopLossPct === null ? null : `stop loss ${risk.stopLossPct}%`,
    risk.takeProfitPct === null ? null : `take profit ${risk.takeProfitPct}%`,
  ].filter(Boolean);
  return (
    <div className="stack-sm">
      <div className="rule-block">
        <h4>Entry</h4>
        <p className="rule-sentence">
          Buy {spec.market.symbol} when {conditionText(spec.entry, spec)}.
        </p>
      </div>
      <div className="rule-block">
        <h4>Exit</h4>
        <p className="rule-sentence">Sell when {conditionText(spec.exit, spec)}.</p>
      </div>
      <div className="rule-block">
        <h4>Risk</h4>
        <p className="rule-sentence">
          {parts.join(", ")}. One position at a time, long only, spot simulation.
        </p>
      </div>
      <div className="rule-block">
        <h4>Indicators</h4>
        {spec.indicators.length === 0 ? (
          <p className="small muted">Price-only conditions.</p>
        ) : (
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
            {(spec.indicators as unknown as Indicator[]).map((indicator) => (
              <li key={indicator.id}>
                <span className="mono tiny">{indicator.id}</span> {indicator.type.toUpperCase()}(
                {indicator.period}
                {indicator.type === "bollinger" ? `, ${indicator.stdDev}σ` : ""}) of{" "}
                {indicator.source}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
