"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, GitBranch, Loader2, Share2, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EquityChart } from "@/components/equity-chart";
import { Metric } from "@/components/metric";
import { PageHeader } from "@/components/page-header";
import { SpecSummary } from "@/components/spec-summary";
import { Disclosure, EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { api, downloadCsv, type EquityPointDto, isApiError } from "@/lib/api";
import { formatDateTime, formatIdr, formatNumber, formatPct, pnlClass } from "@/lib/format";

export default function BacktestResultPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [share, setShare] = useState<{ url: string; expiresAt: string } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const backtest = useQuery({
    queryKey: ["backtest", id],
    queryFn: () => api.getBacktest(id),
    refetchInterval: (query) => {
      const status = query.state.data?.backtest.status;
      return status === "QUEUED" || status === "RUNNING" ? 1500 : false;
    },
  });

  const status = backtest.data?.backtest.status;
  const completed = status === "COMPLETED";

  const equity = useQuery({
    queryKey: ["equity", id],
    queryFn: () => api.getEquity(id),
    enabled: completed,
  });
  const trades = useQuery({
    queryKey: ["trades", id],
    queryFn: () => api.getTrades(id),
    enabled: completed,
  });

  const shareMutation = useMutation({
    mutationFn: () => api.shareBacktest(id, 14),
    onSuccess: (data) => {
      setShare({ url: data.url, expiresAt: data.expiresAt });
      setShareError(null);
    },
    onError: (cause) =>
      setShareError(isApiError(cause) ? cause.message : "Could not create a share link."),
  });
  const revokeMutation = useMutation({
    mutationFn: () => api.revokeShare(id),
    onSuccess: () => {
      setShare(null);
      void queryClient.invalidateQueries({ queryKey: ["backtest", id] });
    },
    onError: (cause) =>
      setShareError(isApiError(cause) ? cause.message : "Could not revoke the share link."),
  });

  if (backtest.isError) {
    return (
      <div className="page">
        <ErrorState
          message={
            isApiError(backtest.error) ? backtest.error.message : "Could not load the backtest."
          }
          retry={() => void backtest.refetch()}
        />
      </div>
    );
  }

  if (backtest.isLoading || !backtest.data) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 40, width: 300 }} />
        <div className="skeleton" style={{ height: 120, marginTop: 20 }} />
        <div className="skeleton" style={{ height: 320, marginTop: 20 }} />
      </div>
    );
  }

  const detail = backtest.data;
  const job = detail.backtest;
  const spec = detail.spec;
  const config = job.config as {
    initialCapital?: number;
    startTime?: string;
    endTime?: string;
    feeRateBps?: number;
    slippageBps?: number;
    executionTiming?: string;
  } | null;
  const manifest = job.dataManifest as {
    provider?: string;
    candleCount?: number;
    firstTimestamp?: number;
    lastTimestamp?: number;
    sha256?: string;
    gaps?: number;
    zeroVolumeCandles?: number;
    fetchedAt?: string;
  } | null;

  if (status === "QUEUED" || status === "RUNNING") {
    return (
      <div className="page narrow">
        <Link href="/backtests" className="small muted row" style={{ marginBottom: 12 }}>
          <ArrowLeft size={13} aria-hidden /> Backtests
        </Link>
        <div className="card">
          <div className="card-body stack">
            <div className="row">
              <Loader2 size={18} className="spin" aria-hidden />
              <h1 style={{ fontSize: 22 }}>
                {status === "QUEUED" ? "Backtest queued" : "Running the simulation"}
              </h1>
            </div>
            <p className="muted">
              {job.strategyName} v{job.versionNumber}. The worker is processing the workshop data
              range. This page updates automatically.
            </p>
            <div className="kv">
              <dt>Status</dt>
              <dd>
                <StatusBadge status={status} />
              </dd>
              <dt>Submitted</dt>
              <dd>{formatDateTime(job.createdAt)}</dd>
              <dt>Data range</dt>
              <dd className="mono">
                {config?.startTime?.slice(0, 10) ?? "—"} → {config?.endTime?.slice(0, 10) ?? "—"}
              </dd>
            </div>
            <div className="notice">
              You can leave this page. The job continues in the background and will appear in
              Backtests.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="page narrow">
        <Link
          href={`/strategies/${job.strategyId}`}
          className="small muted row"
          style={{ marginBottom: 12 }}
        >
          <ArrowLeft size={13} aria-hidden /> {job.strategyName}
        </Link>
        <div className="card">
          <div className="card-body stack">
            <div className="row">
              <ShieldAlert size={18} className="negative" aria-hidden />
              <h1 style={{ fontSize: 22 }}>Backtest failed</h1>
            </div>
            <p className="muted">{job.errorMessage ?? "The simulation could not complete."}</p>
            <div className="kv">
              <dt>Error code</dt>
              <dd className="mono">{job.errorCode ?? "BACKTEST_FAILED"}</dd>
              <dt>Run ID</dt>
              <dd className="mono">{job.id}</dd>
            </div>
            <div className="row">
              <Link
                href={`/strategies/${job.strategyId}/versions/${job.strategyVersionId}`}
                className="btn btn-primary"
              >
                Try another range
              </Link>
              <Link href="/backtests" className="btn">
                All backtests
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const summary = job.summary;
  const tradeItems = trades.data?.items ?? [];
  const equityPoints = (equity.data?.points ?? []) as EquityPointDto[];

  return (
    <div className="page">
      <Link href="/backtests" className="small muted row" style={{ marginBottom: 12 }}>
        <ArrowLeft size={13} aria-hidden /> Backtests
      </Link>
      <PageHeader
        title={job.strategyName}
        description={
          spec
            ? `${spec.market.symbol} · ${spec.market.timeframe} · long-only spot simulation`
            : "Completed simulation"
        }
        meta={
          <div className="row">
            <StatusBadge status={job.status} />
            <span className="badge mono">v{job.versionNumber}</span>
            <span className="tiny muted mono">
              {config?.startTime?.slice(0, 10)} → {config?.endTime?.slice(0, 10)} UTC
            </span>
          </div>
        }
        actions={
          <>
            <Link
              href={`/strategies/${job.strategyId}/versions/${job.strategyVersionId}`}
              className="btn"
            >
              <GitBranch size={15} aria-hidden /> Iterate
            </Link>
            <button type="button" className="btn" onClick={() => downloadCsv(job.id)}>
              <Download size={15} aria-hidden /> CSV
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => shareMutation.mutate()}
              disabled={shareMutation.isPending}
            >
              <Share2 size={15} aria-hidden /> Share
            </button>
          </>
        }
      />

      {share ? (
        <div className="notice notice-positive" style={{ marginBottom: 16 }}>
          <div className="row-between">
            <div>
              <strong>Read-only share link created</strong>
              <div className="mono small" style={{ marginTop: 4, wordBreak: "break-all" }}>
                {share.url}
              </div>
              <span className="tiny muted">
                Expires {formatDateTime(share.expiresAt)}. No account data is shown.
              </span>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(share.url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => revokeMutation.mutate()}
                disabled={revokeMutation.isPending}
              >
                <Trash2 size={13} aria-hidden /> Revoke
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {shareError ? (
        <div className="notice notice-error" style={{ marginBottom: 16 }} role="alert">
          {shareError}
        </div>
      ) : null}

      {!summary ? (
        <div className="notice notice-warning">The result summary is not available.</div>
      ) : (
        <>
          <div className="metric-strip">
            <Metric
              label="Ending equity"
              value={formatIdr(summary.endingEquity)}
              sub={`from ${formatIdr(summary.initialCapital)}`}
            />
            <Metric
              label="Net return"
              value={formatPct(summary.netReturnPct)}
              tone={summary.netReturnPct}
              definition="Ending equity divided by initial capital, minus 1."
            />
            <Metric
              label="Max drawdown"
              value={`${formatNumber(summary.maxDrawdownPct)}%`}
              definition="Largest peak-to-trough decline in the equity curve."
            />
            <Metric
              label="Win rate"
              value={summary.winRatePct === null ? "—" : `${formatNumber(summary.winRatePct, 1)}%`}
              sub={`${summary.totalTrades} closed trades`}
              definition="Profitable closed trades divided by all closed trades."
            />
            <Metric
              label="Profit factor"
              value={summary.profitFactor === null ? "—" : formatNumber(summary.profitFactor)}
              definition="Gross profit divided by absolute gross loss. Empty when there is no loss."
            />
            <Metric
              label="Avg trade"
              value={
                summary.averageTradeReturnPct === null
                  ? "—"
                  : formatPct(summary.averageTradeReturnPct)
              }
              tone={summary.averageTradeReturnPct}
              definition="Mean net P&L divided by entry notional across closed trades."
            />
          </div>

          <div className="section-title">
            <h2>Equity and drawdown</h2>
            <span className="tiny muted">
              {equityPoints.length.toLocaleString()} points · values in IDR
            </span>
          </div>
          <div className="grid-2">
            <div className="card card-pad">
              <h3 style={{ fontSize: 13, marginBottom: 8 }}>Equity</h3>
              <EquityChart points={equityPoints} mode="equity" label="Equity curve in IDR" />
            </div>
            <div className="card card-pad">
              <h3 style={{ fontSize: 13, marginBottom: 8 }}>Drawdown</h3>
              <EquityChart points={equityPoints} mode="drawdown" label="Drawdown percentage" />
            </div>
          </div>

          <div className="section-title">
            <h2>Trades</h2>
            <button type="button" className="btn btn-sm" onClick={() => downloadCsv(job.id)}>
              <Download size={13} aria-hidden /> Download CSV
            </button>
          </div>
          {tradeItems.length === 0 ? (
            <div className="card">
              <EmptyState
                title="No trades in this range"
                description="The conditions did not produce a completed round trip. Try a longer range or a different rule."
              />
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th style={{ textAlign: "right" }}>Entry price</th>
                    <th style={{ textAlign: "right" }}>Exit price</th>
                    <th style={{ textAlign: "right" }}>Quantity</th>
                    <th style={{ textAlign: "right" }}>Fees</th>
                    <th style={{ textAlign: "right" }}>Net P&amp;L</th>
                    <th style={{ textAlign: "right" }}>Return</th>
                    <th>Exit reason</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeItems.map((trade) => (
                    <tr key={trade.sequenceNumber}>
                      <td className="mono">{trade.sequenceNumber}</td>
                      <td className="tiny mono">{formatDateTime(trade.entryTime)}</td>
                      <td className="tiny mono">{formatDateTime(trade.exitTime)}</td>
                      <td className="num">{formatIdr(trade.entryPrice)}</td>
                      <td className="num">{formatIdr(trade.exitPrice)}</td>
                      <td className="num">{formatNumber(trade.quantity, 6)}</td>
                      <td className="num">{formatIdr(trade.entryFee + trade.exitFee)}</td>
                      <td className={`num ${pnlClass(trade.netPnl)}`}>{formatIdr(trade.netPnl)}</td>
                      <td className={`num ${pnlClass(trade.returnPct)}`}>
                        {formatPct(trade.returnPct)}
                      </td>
                      <td className="small muted">{trade.exitReason.replace(/_/g, " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="section-title">
            <h2>Assumptions and data</h2>
          </div>
          <div className="grid-2">
            <div className="card card-pad">
              <dl className="kv">
                <dt>Initial capital</dt>
                <dd>{formatIdr(config?.initialCapital)}</dd>
                <dt>Data range</dt>
                <dd className="mono">
                  {config?.startTime?.slice(0, 10)} → {config?.endTime?.slice(0, 10)} UTC
                </dd>
                <dt>Fee</dt>
                <dd>{config?.feeRateBps} bps per fill</dd>
                <dt>Slippage</dt>
                <dd>{config?.slippageBps} bps per fill</dd>
                <dt>Execution</dt>
                <dd>Next candle open (fixed)</dd>
                <dt>Intrabar policy</dt>
                <dd>Stop loss first when both levels are touched</dd>
                <dt>Position sizing</dt>
                <dd>{spec?.risk.positionSizing.value ?? "—"}% of current equity, one position</dd>
              </dl>
            </div>
            <div className="card card-pad">
              <dl className="kv">
                <dt>Data source</dt>
                <dd>{manifest?.provider ?? "—"}</dd>
                <dt>Candles</dt>
                <dd>{manifest?.candleCount?.toLocaleString() ?? "—"}</dd>
                <dt>First candle</dt>
                <dd className="mono">
                  {manifest?.firstTimestamp ? formatDateTime(manifest.firstTimestamp) : "—"}
                </dd>
                <dt>Last candle</dt>
                <dd className="mono">
                  {manifest?.lastTimestamp ? formatDateTime(manifest.lastTimestamp) : "—"}
                </dd>
                <dt>Gaps</dt>
                <dd>{manifest?.gaps ?? 0} (never filled)</dd>
                <dt>Zero-volume candles</dt>
                <dd>{manifest?.zeroVolumeCandles ?? 0}</dd>
                <dt>Manifest SHA-256</dt>
                <dd className="mono tiny" style={{ wordBreak: "break-all" }}>
                  {manifest?.sha256 ?? "—"}
                </dd>
                <dt>Output hash</dt>
                <dd className="mono tiny" style={{ wordBreak: "break-all" }}>
                  {job.outputHash ?? "—"}
                </dd>
              </dl>
            </div>
          </div>

          {job.warnings.length > 0 ? (
            <div className="notice notice-warning" style={{ marginTop: 16 }}>
              <strong>Data warnings</strong>
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                {job.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {spec ? (
            <>
              <div className="section-title">
                <h2>Rules tested</h2>
                <Link
                  href={`/strategies/${job.strategyId}/versions/${job.strategyVersionId}`}
                  className="small table-link"
                >
                  Open version
                </Link>
              </div>
              <SpecSummary spec={spec} />
            </>
          ) : null}
        </>
      )}

      <Disclosure />
    </div>
  );
}
