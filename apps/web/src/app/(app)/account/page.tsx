"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useSession } from "@/components/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { api, isApiError } from "@/lib/api";

export default function AccountPage() {
  const { user, refresh } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    setError(null);
    try {
      await api.signOut();
      await refresh();
      router.replace("/sign-in");
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : "Could not sign out.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page narrow">
      <PageHeader
        title="Account"
        description="Session, theme, and safety information for this workshop account."
      />
      {error ? (
        <div className="notice notice-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}
      <div className="card">
        <div className="card-body stack">
          <dl className="kv">
            <dt>Email</dt>
            <dd>{user?.email ?? "—"}</dd>
            <dt>Name</dt>
            <dd>{user?.name ?? "—"}</dd>
            <dt>Account type</dt>
            <dd>{user?.isDemo ? "Seeded demo account" : "Workshop participant"}</dd>
            <dt>Session</dt>
            <dd>HTTP-only cookie · expires after 14 days</dd>
          </dl>
          <div className="divider" />
          <div className="row-between">
            <div>
              <h3 style={{ fontSize: 14 }}>Theme</h3>
              <p className="small muted">Light is the default. Your choice is stored locally.</p>
            </div>
            <ThemeToggle />
          </div>
          <div className="divider" />
          <div className="row-between">
            <div>
              <h3 style={{ fontSize: 14 }}>Simulation only</h3>
              <p className="small muted">
                No exchange keys, live orders, custody, leverage, or shorting. Every result is a
                historical simulation.
              </p>
            </div>
          </div>
          <div className="divider" />
          <button type="button" className="btn btn-danger" onClick={signOut} disabled={pending}>
            <LogOut size={15} aria-hidden /> {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
      <p className="tiny faint" style={{ marginTop: 16 }}>
        Need help during the workshop? Ask the facilitator. Include the request ID shown in an error
        if one appears.
      </p>
    </div>
  );
}
