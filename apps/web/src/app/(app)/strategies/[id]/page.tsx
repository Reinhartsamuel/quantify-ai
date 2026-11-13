"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowRight, GitBranch, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { api, isApiError } from "@/lib/api";
import { formatPct, pnlClass, relativeTime } from "@/lib/format";

export default function StrategyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const strategy = useQuery({ queryKey: ["strategy", id], queryFn: () => api.getStrategy(id) });
  const backtests = useQuery({
    queryKey: ["strategy-backtests", id],
    queryFn: () => api.listStrategyBacktests(id),
  });

  const archive = useMutation({
    mutationFn: () => api.updateStrategy(id, { status: "archived" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["strategy", id] });
      router.refresh();
    },
    onError: (cause) => setActionError(isApiError(cause) ? cause.message : "Could not archive."),
  });

  if (strategy.isError) {
    return (
      <div className="page">
        <ErrorState
          message={
            isApiError(strategy.error) ? strategy.error.message : "Could not load the strategy."
          }
          retry={() => void strategy.refetch()}
        />
      </div>
    );
  }
  if (strategy.isLoading || !strategy.data) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 40, width: 280 }} />
        <div className="skeleton" style={{ height: 240, marginTop: 20 }} />
      </div>
    );
  }

  const { strategy: item, versions } = strategy.data;
  const latest = versions[0];
  const iterateHref = latest
    ? `/strategies/new?strategyId=${item.id}&fromVersion=${latest.id}`
    : `/strategies/new?strategyId=${item.id}`;

  return (
    <div className="page">
      <PageHeader
        title={item.name}
        description={item.description || "No description."}
        meta={
          <div className="row">
            {item.symbol ? <span className="badge">{item.symbol}</span> : null}
            {item.timeframe ? <span className="badge">{item.timeframe}</span> : null}
            <span className={item.status === "archived" ? "badge" : "badge badge-positive"}>
              {item.status}
            </span>
            <span className="tiny faint">Updated {relativeTime(item.updatedAt)}</span>
          </div>
        }
        actions={
          <>
            {latest ? (
              <Link
                href={`/strategies/${item.id}/versions/${latest.id}?run=1`}
                className="btn btn-primary"
              >
                <Play size={15} aria-hidden /> Run backtest
              </Link>
            ) : null}
            <Link href={iterateHref} className="btn">
              <GitBranch size={15} aria-hidden /> New version
            </Link>
            {item.status === "active" ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => archive.mutate()}
                disabled={archive.isPending}
              >
                <Archive size={15} aria-hidden /> Archive
              </button>
            ) : null}
          </>
        }
      />

      {actionError ? (
        <div className="notice notice-error" role="alert">
          {actionError}
        </div>
      ) : null}

      <div className="section-title">
        <h2>Versions</h2>
        <span className="tiny muted">Immutable snapshots</span>
      </div>

      {versions.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No saved versions"
            description="Open the builder to review the rules and save the first immutable version."
            action={{ href: `/strategies/new?strategyId=${item.id}`, label: "Open builder" }}
            icon={<Plus size={18} aria-hidden />}
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Version</th>
                <th>Indicators</th>
                <th>Source</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => {
                const spec = version.spec as {
                  indicators?: Array<{ id: string; type: string; period: number }>;
                  market?: { symbol: string; timeframe: string };
                };
                return (
                  <tr key={version.id}>
                    <td>
                      <Link
                        href={`/strategies/${item.id}/versions/${version.id}`}
                        className="table-link mono"
                      >
                        v{version.versionNumber}
                      </Link>
                      {version.versionNumber === latest?.versionNumber ? (
                        <span className="badge badge-accent" style={{ marginLeft: 8 }}>
                          Latest
                        </span>
                      ) : null}
                    </td>
                    <td className="small muted">
                      {spec.indicators && spec.indicators.length > 0
                        ? spec.indicators
                            .map(
                              (indicator) => `${indicator.type.toUpperCase()} ${indicator.period}`,
                            )
                            .join(" · ")
                        : "Price only"}
                    </td>
                    <td className="small muted" style={{ maxWidth: 300 }}>
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {version.sourcePrompt ?? "—"}
                      </span>
                    </td>
                    <td className="small muted">{relativeTime(version.createdAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/strategies/${item.id}/versions/${version.id}`}
                        className="btn btn-sm"
                      >
                        Open <ArrowRight size={13} aria-hidden />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-title">
        <h2>Backtests</h2>
        <Link href="/backtests" className="small table-link">
          All backtests
        </Link>
      </div>

      {backtests.isLoading ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : (backtests.data?.items.length ?? 0) === 0 ? (
        <p className="small muted">
          No backtests for this strategy yet. Run one from a saved version.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Net return</th>
                <th style={{ textAlign: "right" }}>Max drawdown</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {(backtests.data?.items ?? []).map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link href={`/backtests/${job.id}`} className="table-link mono">
                      {job.id.slice(0, 8)}
                    </Link>
                    <span className="tiny muted" style={{ display: "block" }}>
                      v{job.versionNumber}
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={job.status} />
                  </td>
                  <td className={`num ${pnlClass(job.summary?.netReturnPct)}`}>
                    {job.summary ? formatPct(job.summary.netReturnPct) : "—"}
                  </td>
                  <td className="num">
                    {job.summary ? `${job.summary.maxDrawdownPct.toFixed(2)}%` : "—"}
                  </td>
                  <td className="small muted">{relativeTime(job.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
