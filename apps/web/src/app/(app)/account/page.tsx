"use client";

import { LogOut, ShieldAlert } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useSession } from "@/components/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { api, isApiError } from "@/lib/api";

const EXCHANGES = [
  {
    id: "indodax",
    name: "Indodax",
    image: "/images/exchanges/indodax.png",
    description: "Indonesian spot exchange (workshop data source)",
    badge: "Workshop data",
    available: true,
  },
  {
    id: "binance",
    name: "Binance",
    image: "/images/exchanges/binance.png",
    description: "Global spot & futures",
    badge: "Coming soon",
    available: false,
  },
  {
    id: "gate",
    name: "Gate.io",
    image: "/images/exchanges/gate.png",
    description: "Spot, futures & options",
    badge: "Coming soon",
    available: false,
  },
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    image: "/images/exchanges/hyperliquid.png",
    description: "Perpetuals DEX on L1",
    badge: "Coming soon",
    available: false,
  },
] as const;

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
            <ShieldAlert size={16} aria-hidden className="muted" />
          </div>
          <div className="divider" />
          <div>
            <h3 style={{ fontSize: 14 }}>Exchange connections</h3>
            <p className="small muted" style={{ marginBottom: 12 }}>
              Future versions will let you connect exchange API keys for live data and (paper)
              trading. For now, workshop data comes from Indodax.
            </p>
            <div className="grid-4">
              {EXCHANGES.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  className="card card-pad btn btn-ghost"
                  style={{
                    textAlign: "center",
                    minWidth: 0,
                    opacity: ex.available ? 1 : 0.6,
                  }}
                  disabled={!ex.available}
                >
                  <Image
                    src={ex.image}
                    alt={ex.name}
                    width={32}
                    height={32}
                    style={{ display: "block", margin: "0 auto 8px" }}
                  />
                  <strong style={{ display: "block", marginBottom: 4 }}>{ex.name}</strong>
                  {ex.available && (
                    <p className="small muted" style={{ marginBottom: 8 }}>
                      {ex.description}
                    </p>
                  )}
                  <span className={`badge ${ex.available ? "badge-positive" : "badge-accent"}`}>
                    {ex.badge}
                  </span>
                </button>
              ))}
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
