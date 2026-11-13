import { AlertTriangle, Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Inbox size={18} aria-hidden />}</div>
      <h3>{title}</h3>
      <p className="copy">{description}</p>
      {action ? (
        <Link href={action.href} className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  retry,
}: {
  title?: string;
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="notice notice-error" role="alert">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <AlertTriangle size={16} aria-hidden style={{ marginTop: 2 }} />
        <div>
          <strong>{title}</strong>
          <p className="small" style={{ marginTop: 2 }}>
            {message}
          </p>
          {retry ? (
            <button type="button" className="btn btn-sm" onClick={retry} style={{ marginTop: 8 }}>
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Disclosure() {
  return (
    <p className="notice" style={{ marginTop: 18 }}>
      Simulated historical result. Not investment advice. Past performance does not predict future
      results. Real execution may differ due to liquidity, latency, and exchange rules.
    </p>
  );
}
