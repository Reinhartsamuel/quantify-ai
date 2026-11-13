"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Metric } from "@/components/metric";
import { ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api";
import { formatDateTime, formatIdr, formatNumber, formatPct } from "@/lib/format";

export default function SharedResultPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const shared = useQuery({
    queryKey: ["share", token],
    queryFn: () => api.shareResult(token),
    retry: false,
  });

  if (shared.isError) {
    return (
      <main className="page narrow">
        <h1>Result unavailable</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          This share link is invalid, expired, or was revoked.
        </p>
        <Link href="/sign-in" className="btn" style={{ marginTop: 16 }}>
          Open Quantify
        </Link>
      </main>
    );
  }
  if (shared.isLoading || !shared.data) {
    return (
      <main className="page narrow">
        <div className="skeleton" style={{ height: 40, width: 260 }} />
        <div className="skeleton" style={{ height: 120, marginTop: 20 }} />
      </main>
    );
  }

  const { result, disclosure, expiresAt } = shared.data;
  const summary = result.summary;
  const config = result.config as {
    startTime?: string;
    endTime?: string;
    feeRateBps?: number;
    slippageBps?: number;
  } | null;
  const manifest = result.dataManifest as {
    candleCount?: number;
    sha256?: string;
    gaps?: number;
  } | null;

  return (
    <main className="page" style={{ maxWidth: 900 }}>
      <div className="row-between" style={{ marginBottom: 20 }}>
        <div>
          <span className="badge">Shared result · read only</span>
          <h1 style={{ marginTop: 10 }}>{result.strategyName}</h1>
          <p className="muted small">
            v{result.versionNumber} · {config?.startTime?.slice(0, 10)} →{" "}
            {config?.endTime?.slice(0, 10)} UTC
          </p>
        </div>
        <StatusBadge status={result.status} />
      </div>

      {summary ? (
        <div className="metric-strip">
          <Metric label="Ending equity" value={formatIdr(summary.endingEquity)} />
          <Metric
            label="Net return"
            value={formatPct(summary.netReturnPct)}
            tone={summary.netReturnPct}
          />
          <Metric label="Max drawdown" value={`${formatNumber(summary.maxDrawdownPct)}%`} />
          <Metric
            label="Win rate"
            value={summary.winRatePct === null ? "—" : `${formatNumber(summary.winRatePct, 1)}%`}
          />
          <Metric label="Trades" value={String(summary.totalTrades)} />
          <Metric
            label="Profit factor"
            value={summary.profitFactor === null ? "—" : formatNumber(summary.profitFactor)}
          />
        </div>
      ) : (
        <ErrorState message="The shared summary is unavailable." />
      )}

      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="card card-pad">
          <h3 style={{ fontSize: 13, marginBottom: 8 }}>Assumptions</h3>
          <dl className="kv">
            <dt>Initial capital</dt>
            <dd>{formatIdr(summary?.initialCapital ?? 0)}</dd>
            <dt>Fees</dt>
            <dd>{config?.feeRateBps ?? "—"} bps per fill</dd>
            <dt>Slippage</dt>
            <dd>{config?.slippageBps ?? "—"} bps per fill</dd>
            <dt>Data</dt>
            <dd>{manifest?.candleCount?.toLocaleString() ?? "—"} candles</dd>
            <dt>Gaps</dt>
            <dd>{manifest?.gaps ?? 0} (not filled)</dd>
            <dt>Expires</dt>
            <dd>{formatDateTime(expiresAt)}</dd>
          </dl>
        </div>
        <div className="card card-pad">
          <h3 style={{ fontSize: 13, marginBottom: 8 }}>What this is</h3>
          <p className="small muted">{disclosure}</p>
          <p className="small muted" style={{ marginTop: 10 }}>
            This page shows the result and assumptions only. It contains no account data. A share
            link can be revoked by the owner at any time.
          </p>
        </div>
      </div>

      <p className="notice" style={{ marginTop: 18 }}>
        {disclosure}
      </p>
      <p className="tiny faint" style={{ marginTop: 14 }}>
        Simulated on Indodax historical candles. Data manifest SHA-256:{" "}
        <span className="mono">{manifest?.sha256 ?? "—"}</span>
      </p>
    </main>
  );
}
