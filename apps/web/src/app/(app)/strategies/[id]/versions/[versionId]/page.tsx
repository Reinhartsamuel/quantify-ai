"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, GitBranch, Play } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BacktestForm } from "@/components/backtest-form";
import { PageHeader } from "@/components/page-header";
import { SpecSummary } from "@/components/spec-summary";
import { ErrorState } from "@/components/states";
import { api, isApiError, type StrategySpecLike } from "@/lib/api";
import { formatPct, pnlClass } from "@/lib/format";

function VersionPage() {
  const params = useParams<{ id: string; versionId: string }>();
  const [against, setAgainst] = useState("");

  const strategy = useQuery({
    queryKey: ["strategy", params.id],
    queryFn: () => api.getStrategy(params.id),
  });
  const version = useQuery({
    queryKey: ["version", params.id, params.versionId],
    queryFn: () => api.getVersion(params.id, params.versionId),
  });
  const compare = useQuery({
    queryKey: ["compare", params.id, params.versionId, against],
    queryFn: () => api.compareVersions(params.id, params.versionId, against),
    enabled: Boolean(against),
  });

  if (version.isError) {
    return (
      <div className="page">
        <ErrorState
          message={
            isApiError(version.error) ? version.error.message : "Could not load the version."
          }
          retry={() => void version.refetch()}
        />
      </div>
    );
  }
  if (version.isLoading || !version.data) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 40, width: 260 }} />
        <div className="skeleton" style={{ height: 300, marginTop: 20 }} />
      </div>
    );
  }

  const current = version.data.version;
  const spec = current.spec as StrategySpecLike;
  const otherVersions = (strategy.data?.versions ?? []).filter((item) => item.id !== current.id);

  return (
    <div className="page">
      <Link
        href={`/strategies/${current.strategyId}`}
        className="small muted row"
        style={{ marginBottom: 12 }}
      >
        <ArrowLeft size={13} aria-hidden /> {strategy.data?.strategy.name ?? "Strategy"}
      </Link>
      <PageHeader
        title={`${spec.name} · v${current.versionNumber}`}
        description={spec.description}
        meta={
          <div className="row">
            <span className="badge">{spec.market.symbol}</span>
            <span className="badge">{spec.market.timeframe}</span>
            <span className="badge">Schema {current.schemaVersion}</span>
            {current.provider ? <span className="badge">{current.provider}</span> : null}
          </div>
        }
        actions={
          <>
            <Link
              href={`/strategies/new?strategyId=${current.strategyId}&fromVersion=${current.id}`}
              className="btn"
            >
              <GitBranch size={15} aria-hidden /> Iterate
            </Link>
            <Link href="#run" className="btn btn-primary">
              <Play size={15} aria-hidden /> Run backtest
            </Link>
          </>
        }
      />

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <div>
                <h2 style={{ fontSize: 15 }}>Rules</h2>
                <p className="tiny muted">Exact rules saved in this immutable version</p>
              </div>
            </div>
            <div className="card-body">
              <SpecSummary spec={spec} />
            </div>
          </div>

          {current.sourcePrompt ? (
            <div className="card card-pad">
              <h3 style={{ fontSize: 13 }}>Original description</h3>
              <p className="small muted" style={{ marginTop: 6 }}>
                {current.sourcePrompt}
              </p>
            </div>
          ) : null}

          <details className="card card-pad">
            <summary className="small muted" style={{ cursor: "pointer" }}>
              Advanced JSON (read-only)
            </summary>
            <pre
              className="mono tiny"
              style={{ overflowX: "auto", marginTop: 12, color: "var(--muted)" }}
            >
              {JSON.stringify(spec, null, 2)}
            </pre>
          </details>
        </div>

        <div className="card" id="run">
          <div className="card-head">
            <div>
              <h2 style={{ fontSize: 15 }}>Backtest configuration</h2>
              <p className="tiny muted">
                {spec.market.symbol} · {spec.market.timeframe} · UTC
              </p>
            </div>
          </div>
          <div className="card-body">
            <BacktestForm
              versionId={current.id}
              symbol={spec.market.symbol}
              timeframe={spec.market.timeframe}
            />
          </div>
        </div>
      </div>

      <div className="section-title">
        <h2>Version comparison</h2>
        <span className="tiny muted">Same strategy, different snapshots</span>
      </div>
      <div className="card">
        <div className="card-body stack-sm">
          {otherVersions.length === 0 ? (
            <p className="small muted">
              Save another version to compare results side by side. Comparisons use the latest
              completed backtest for each version.
            </p>
          ) : (
            <>
              <div className="row">
                <div className="field" style={{ maxWidth: 280 }}>
                  <label htmlFor="against">Compare against</label>
                  <select
                    id="against"
                    className="select"
                    value={against}
                    onChange={(event) => setAgainst(event.target.value)}
                  >
                    <option value="">Select a version</option>
                    {otherVersions.map((item) => (
                      <option key={item.id} value={item.id}>
                        v{item.versionNumber} ·{" "}
                        {new Date(item.createdAt).toISOString().slice(0, 10)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {compare.isError ? (
                <ErrorState
                  message={isApiError(compare.error) ? compare.error.message : "Comparison failed."}
                />
              ) : null}
              {compare.data ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th style={{ textAlign: "right" }}>v{current.versionNumber}</th>
                        <th style={{ textAlign: "right" }}>
                          v{compare.data.against.version.versionNumber}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          { label: "Net return", key: "netReturnPct", kind: "pct" },
                          { label: "Max drawdown", key: "maxDrawdownPct", kind: "pct" },
                          { label: "Win rate", key: "winRatePct", kind: "pct" },
                          { label: "Trades", key: "totalTrades", kind: "number" },
                          { label: "Ending equity", key: "endingEquity", kind: "idr" },
                        ] as const
                      ).map(({ label, key, kind }) => {
                        const currentValue = (
                          compare.data.current.summary as Record<string, number | null> | null
                        )?.[key];
                        const againstValue = (
                          compare.data.against.summary as Record<string, number | null> | null
                        )?.[key];
                        const render = (value: number | null | undefined) => {
                          if (value === null || value === undefined) return "—";
                          if (kind === "pct") return formatPct(value);
                          if (kind === "number") return String(value);
                          return new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "IDR",
                            maximumFractionDigits: 0,
                          }).format(value);
                        };
                        return (
                          <tr key={key}>
                            <td>{label}</td>
                            <td className={`num ${kind === "pct" ? pnlClass(currentValue) : ""}`}>
                              {render(currentValue)}
                            </td>
                            <td className="num">{render(againstValue)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {compare.data && !compare.data.sameConfig ? (
                <p className="tiny warning">
                  The versions used different backtest configurations. Treat the comparison as
                  indicative, not like-for-like.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
      <p className="tiny faint" style={{ marginTop: 16 }}>
        Fees and slippage are part of each backtest configuration. A version alone is not a result.
      </p>
    </div>
  );
}

export default function VersionDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <div className="skeleton" style={{ height: 240 }} />
        </div>
      }
    >
      <VersionPage />
    </Suspense>
  );
}
