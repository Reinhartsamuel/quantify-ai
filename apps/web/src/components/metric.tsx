import type { ReactNode } from "react";
import { pnlClass } from "@/lib/format";

export function Metric({
  label,
  value,
  sub,
  tone,
  definition,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: number | null;
  definition?: string;
}) {
  const className = tone === undefined ? "metric-value" : `metric-value ${pnlClass(tone)}`;
  return (
    <div className="metric">
      <span className="metric-label" title={definition}>
        {label}
      </span>
      <span className={className}>{value}</span>
      {sub ? <span className="metric-sub">{sub}</span> : null}
    </div>
  );
}
