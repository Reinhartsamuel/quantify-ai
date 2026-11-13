"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { api, isApiError } from "@/lib/api";
import { formatIdr, formatPct, pnlClass, relativeTime } from "@/lib/format";

export default function BacktestsPage() {
  const [cursor, setCursor] = useState<string | undefined>();
  const backtests = useQuery({
    queryKey: ["backtests", cursor],
    queryFn: () => api.listBacktests(cursor),
  });
  const items = backtests.data?.items ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Backtests"
        description="Every run is tied to an immutable strategy version, a data manifest, and a configuration."
        actions={
          <Link href="/strategies" className="btn btn-primary">
            Choose a strategy
          </Link>
        }
      />

      {backtests.isError ? (
        <ErrorState
          message={
            isApiError(backtests.error) ? backtests.error.message : "Could not load backtests."
          }
          retry={() => void backtests.refetch()}
        />
      ) : backtests.isLoading ? (
        <div className="stack">
          <div className="skeleton" style={{ height: 46 }} />
          <div className="skeleton" style={{ height: 46 }} />
          <div className="skeleton" style={{ height: 46 }} />
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No backtests yet"
            description="Save a strategy version, choose a date range, and run a simulation. Results are reproducible from the stored metadata."
            action={{ href: "/strategies/new", label: "Create a strategy" }}
          />
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Backtest</th>
                  <th>Strategy</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Net return</th>
                  <th style={{ textAlign: "right" }}>Max drawdown</th>
                  <th style={{ textAlign: "right" }}>Ending equity</th>
                  <th>Range</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => {
                  const config = job.config as { startTime?: string; endTime?: string } | null;
                  return (
                    <tr key={job.id}>
                      <td>
                        <Link href={`/backtests/${job.id}`} className="table-link mono">
                          {job.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/strategies/${job.strategyId}`} className="table-link">
                          {job.strategyName}
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
                      <td className="num">
                        {job.summary ? formatIdr(job.summary.endingEquity) : "—"}
                      </td>
                      <td className="tiny muted mono">
                        {config?.startTime ? config.startTime.slice(0, 10) : "—"} →{" "}
                        {config?.endTime ? config.endTime.slice(0, 10) : "—"}
                      </td>
                      <td className="small muted">{relativeTime(job.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row-between" style={{ marginTop: 14 }}>
            <span className="tiny muted">
              {backtests.data?.nextCursor ? "More results available" : "End of list"}
            </span>
            <div className="row">
              <button
                type="button"
                className="btn btn-sm"
                disabled={!cursor}
                onClick={() => setCursor(undefined)}
              >
                First page
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!backtests.data?.nextCursor}
                onClick={() => setCursor(backtests.data?.nextCursor ?? undefined)}
              >
                Next page
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
