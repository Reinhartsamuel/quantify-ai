import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <Link href="/" className="brand" style={{ borderBottom: "none", padding: 0 }}>
          <span className="brand-mark">Q</span>
          <span className="brand-name">Quantify</span>
        </Link>
        <div>
          <p className="auth-purpose">
            Describe a strategy. See the rules. Test them on real historical data.
          </p>
          <div className="auth-points" style={{ marginTop: 28 }}>
            <div className="auth-point">
              <span className="mono tiny" style={{ color: "var(--accent)" }}>
                01
              </span>
              <span>
                <strong>Structured, not magical.</strong> AI turns plain language into an editable
                rule set you can inspect.
              </span>
            </div>
            <div className="auth-point">
              <span className="mono tiny" style={{ color: "var(--accent)" }}>
                02
              </span>
              <span>
                <strong>Deterministic backtests.</strong> Fees, slippage, and the exact data range
                are always visible.
              </span>
            </div>
            <div className="auth-point">
              <span className="mono tiny" style={{ color: "var(--accent)" }}>
                03
              </span>
              <span>
                <strong>Simulation only.</strong> No exchange keys, no live orders, no custody.
              </span>
            </div>
          </div>
        </div>
        <p className="tiny faint">
          BlockDev.id workshop build. Historical simulation, not investment advice.
        </p>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div>
            <h1 style={{ fontSize: 24 }}>{title}</h1>
            <p className="muted small" style={{ marginTop: 6 }}>
              {subtitle}
            </p>
          </div>
          {children}
          <div className="small muted" style={{ textAlign: "center" }}>
            {footer}
          </div>
        </div>
      </main>
    </div>
  );
}
