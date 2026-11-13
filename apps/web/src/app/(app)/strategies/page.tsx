"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { api, isApiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";

export default function StrategiesPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const strategies = useQuery({
    queryKey: ["strategies", query, status, cursor],
    queryFn: () =>
      api.listStrategies({ q: query || undefined, status: status || undefined, cursor }),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.updateStrategy(id, { status: "archived" }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["strategies"] });
    },
    onError: (cause) =>
      setError(isApiError(cause) ? cause.message : "Could not archive the strategy."),
  });

  const items = strategies.data?.items ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Strategies"
        description="Your saved strategies and their immutable versions. Archived strategies keep their backtests."
        actions={
          <Link href="/strategies/new" className="btn btn-primary">
            <Plus size={15} aria-hidden />
            New strategy
          </Link>
        }
      />

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="field" style={{ flex: "1 1 260px", maxWidth: 360 }}>
          <label htmlFor="search" className="tiny muted">
            Search by name
          </label>
          <div style={{ position: "relative" }}>
            <Search
              size={15}
              aria-hidden
              style={{ position: "absolute", left: 10, top: 11, color: "var(--muted)" }}
            />
            <input
              id="search"
              className="input"
              style={{ paddingLeft: 32 }}
              value={query}
              placeholder="e.g. EMA crossover"
              onChange={(event) => {
                setCursor(undefined);
                setQuery(event.target.value);
              }}
            />
          </div>
        </div>
        <div className="field" style={{ width: 160 }}>
          <label htmlFor="status" className="tiny muted">
            Status
          </label>
          <select
            id="status"
            className="select"
            value={status}
            onChange={(event) => {
              setCursor(undefined);
              setStatus(event.target.value);
            }}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="notice notice-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      {strategies.isError ? (
        <ErrorState
          message={
            isApiError(strategies.error) ? strategies.error.message : "Could not load strategies."
          }
          retry={() => void strategies.refetch()}
        />
      ) : strategies.isLoading ? (
        <div className="stack">
          <div className="skeleton" style={{ height: 46 }} />
          <div className="skeleton" style={{ height: 46 }} />
          <div className="skeleton" style={{ height: 46 }} />
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            title={query || status ? "No strategies match" : "No strategies yet"}
            description={
              query || status
                ? "Clear the filters or try a different name."
                : "Describe an idea or start from a template. Every saved change becomes a new version."
            }
            action={{ href: "/strategies/new", label: "Create a strategy" }}
          />
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Market</th>
                  <th>Latest version</th>
                  <th>Latest backtest</th>
                  <th>Updated</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((strategy) => (
                  <tr key={strategy.id}>
                    <td>
                      <Link href={`/strategies/${strategy.id}`} className="table-link">
                        {strategy.name}
                      </Link>
                      {strategy.status === "archived" ? (
                        <span className="badge" style={{ marginLeft: 8 }}>
                          Archived
                        </span>
                      ) : null}
                    </td>
                    <td className="small muted">
                      {strategy.symbol ?? "—"} · {strategy.timeframe ?? "—"}
                    </td>
                    <td className="mono small">
                      {strategy.latestVersionNumber === null
                        ? "—"
                        : `v${strategy.latestVersionNumber}`}
                    </td>
                    <td>
                      {strategy.latestBacktestStatus ? (
                        <StatusBadge status={strategy.latestBacktestStatus} />
                      ) : (
                        <span className="muted small">Not run</span>
                      )}
                    </td>
                    <td className="small muted">{relativeTime(strategy.updatedAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      {strategy.status === "active" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => archive.mutate(strategy.id)}
                          disabled={archive.isPending}
                          aria-label={`Archive ${strategy.name}`}
                        >
                          <Archive size={14} aria-hidden />
                          Archive
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row-between" style={{ marginTop: 14 }}>
            <span className="tiny muted">
              {strategies.data?.nextCursor ? "More results available" : "End of list"}
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
                disabled={!strategies.data?.nextCursor}
                onClick={() => setCursor(strategies.data?.nextCursor ?? undefined)}
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
