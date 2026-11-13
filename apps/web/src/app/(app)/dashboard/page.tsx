"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Circle, FlaskConical, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useSession } from "@/components/session";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { api, isApiError } from "@/lib/api";
import { formatIdr, formatPct, pnlClass, relativeTime } from "@/lib/format";

export default function DashboardPage() {
  const { user } = useSession();
  const [checklistHidden, setChecklistHidden] = useState(false);

  useEffect(() => {
    try {
      setChecklistHidden(localStorage.getItem("quantify-onboarding-dismissed") === "1");
    } catch {
      setChecklistHidden(false);
    }
  }, []);

  const strategies = useQuery({
    queryKey: ["strategies", "recent"],
    queryFn: () => api.listStrategies(),
  });
  const backtests = useQuery({
    queryKey: ["backtests", "recent"],
    queryFn: () => api.listBacktests(),
  });
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: api.templates,
    staleTime: 300_000,
  });

  const strategyItems = strategies.data?.items ?? [];
  const backtestItems = backtests.data?.items ?? [];
  const hasStrategy = strategyItems.length > 0;
  const hasVersion = strategyItems.some((item) => item.latestVersionNumber !== null);
  const hasBacktest = backtestItems.length > 0;
  const checklistDone = hasStrategy && hasVersion && hasBacktest;
  const dismissed = checklistHidden || checklistDone;
  const resume = backtestItems[0];

  function dismissChecklist() {
    setChecklistHidden(true);
    try {
      localStorage.setItem("quantify-onboarding-dismissed", "1");
    } catch {
      // Non-critical.
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={`Welcome back${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description="Describe a strategy, review the rules, and test it on historical Indodax data. Everything here is simulation."
        actions={
          <>
            <Link href="/strategies/new" className="btn btn-primary">
              <Sparkles size={15} aria-hidden />
              Start a strategy
            </Link>
            <Link href="/strategies/new?template=ema-crossover" className="btn">
              Use a template
            </Link>
          </>
        }
      />

      {!dismissed ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head">
            <div>
              <h2>Your first backtest</h2>
              <p className="small muted">Three steps. About five minutes.</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={dismissChecklist}>
              Dismiss
            </button>
          </div>
          <div className="card-body">
            <div className="grid-3">
              {[
                {
                  done: hasStrategy,
                  title: "Create a strategy",
                  body: "Start from a prompt or a template.",
                  href: "/strategies/new",
                },
                {
                  done: hasVersion,
                  title: "Review and save rules",
                  body: "Confirm entry, exit, and risk.",
                  href: hasStrategy ? "/strategies" : "/strategies/new",
                },
                {
                  done: hasBacktest,
                  title: "Run a backtest",
                  body: "Choose a range and read the result.",
                  href: backtestItems[0] ? `/backtests/${backtestItems[0].id}` : "/strategies",
                },
              ].map((step, index) => (
                <Link
                  key={step.title}
                  href={step.href}
                  className="rule-block"
                  style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                >
                  <span
                    style={{
                      color: step.done ? "var(--positive)" : "var(--muted)",
                      marginTop: 1,
                    }}
                    aria-hidden
                  >
                    {step.done ? <Check size={16} /> : <Circle size={15} />}
                  </span>
                  <span>
                    <strong style={{ display: "block", fontSize: 14 }}>
                      {index + 1}. {step.title}
                    </strong>
                    <span className="small muted">{step.body}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid-2" style={{ alignItems: "stretch" }}>
        {resume ? (
          <div className="card">
            <div className="card-head">
              <div>
                <h2 style={{ fontSize: 16 }}>Resume</h2>
                <p className="small muted">Most recent backtest</p>
              </div>
              <StatusBadge status={resume.status} />
            </div>
            <div className="card-body stack-sm">
              <Link
                href={`/backtests/${resume.id}`}
                className="table-link"
                style={{ fontSize: 16 }}
              >
                {resume.strategyName}
              </Link>
              <span className="tiny muted">
                Version {resume.versionNumber} · {relativeTime(resume.createdAt)}
              </span>
              {resume.summary ? (
                <div className="row" style={{ marginTop: 6 }}>
                  <span className={`mono ${pnlClass(resume.summary.netReturnPct)}`}>
                    {formatPct(resume.summary.netReturnPct)}
                  </span>
                  <span className="small muted">net return</span>
                  <span className="faint">·</span>
                  <span className="mono small">{formatIdr(resume.summary.endingEquity)}</span>
                  <span className="small muted">ending equity</span>
                </div>
              ) : (
                <span className="small muted">The result is not ready yet.</span>
              )}
            </div>
            <div className="card-foot">
              <Link href={`/backtests/${resume.id}`} className="btn btn-sm">
                Open result <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">
                <Play size={18} aria-hidden />
              </div>
              <h3>No backtest yet</h3>
              <p className="copy">
                Generate a strategy, save a version, and run it against the workshop range. The
                first run is the fastest way to understand the tool.
              </p>
              <Link
                href="/strategies/new"
                className="btn btn-primary btn-sm"
                style={{ marginTop: 8 }}
              >
                Start a strategy
              </Link>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <div>
              <h2 style={{ fontSize: 16 }}>Templates</h2>
              <p className="small muted">Prebuilt, editable starting points</p>
            </div>
            <FlaskConical size={18} aria-hidden className="muted" />
          </div>
          <div className="card-body template-list">
            {(templates.data?.templates ?? []).map((template) => (
              <Link
                key={template.id}
                href={`/strategies/new?template=${template.id}`}
                className="template-btn"
              >
                <strong>{template.name}</strong>
                <span>{template.description}</span>
              </Link>
            ))}
            {templates.isLoading ? <div className="skeleton" style={{ height: 72 }} /> : null}
          </div>
        </div>
      </div>

      <div className="section-title">
        <h2>Recent strategies</h2>
        <Link href="/strategies" className="small table-link">
          View all
        </Link>
      </div>
      {strategies.isError ? (
        <ErrorState
          message={
            isApiError(strategies.error) ? strategies.error.message : "Could not load strategies."
          }
          retry={() => void strategies.refetch()}
        />
      ) : strategyItems.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No strategies yet"
            description="Begin with a plain-language idea. You can edit every rule before saving."
            action={{ href: "/strategies/new", label: "Create your first strategy" }}
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Market</th>
                <th>Version</th>
                <th>Latest backtest</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {strategyItems.slice(0, 6).map((strategy) => (
                <tr key={strategy.id}>
                  <td>
                    <Link href={`/strategies/${strategy.id}`} className="table-link">
                      {strategy.name}
                    </Link>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-title">
        <h2>Recent backtests</h2>
        <Link href="/backtests" className="small table-link">
          View all
        </Link>
      </div>
      {backtestItems.length === 0 ? (
        <p className="small muted">
          Completed backtests will appear here with their net return and drawdown.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Net return</th>
                <th style={{ textAlign: "right" }}>Max drawdown</th>
                <th>Range</th>
              </tr>
            </thead>
            <tbody>
              {backtestItems.slice(0, 6).map((job) => {
                const config = job.config as { startTime?: string; endTime?: string } | null;
                return (
                  <tr key={job.id}>
                    <td>
                      <Link href={`/backtests/${job.id}`} className="table-link">
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
                    <td className="tiny muted mono">
                      {config?.startTime
                        ? new Date(config.startTime).toISOString().slice(0, 10)
                        : "—"}{" "}
                      →{" "}
                      {config?.endTime ? new Date(config.endTime).toISOString().slice(0, 10) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
