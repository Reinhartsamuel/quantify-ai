"use client";

import {
  BookOpen,
  ChevronRight,
  FlaskConical,
  LayoutDashboard,
  ListOrdered,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "./session";
import { ThemeToggle } from "./theme-toggle";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/strategies", label: "Strategies", icon: FlaskConical },
  { href: "/backtests", label: "Backtests", icon: ListOrdered },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/account", label: "Account", icon: UserRound },
];

function titleFor(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname === "/strategies/new") return "New strategy";
  if (pathname.startsWith("/strategies/")) return "Strategy";
  if (pathname === "/strategies") return "Strategies";
  if (pathname.startsWith("/backtests/")) return "Backtest result";
  if (pathname === "/backtests") return "Backtests";
  if (pathname === "/learn") return "Learn";
  if (pathname === "/account") return "Account";
  return "Workspace";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const active = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <div className="app-shell">
      <aside className="rail">
        <div>
          <Link href="/dashboard" className="brand" aria-label="Quantify dashboard">
            <span className="brand-mark">Q</span>
            <span>
              <span className="brand-name">Quantify</span>
              <span className="tiny muted" style={{ display: "block" }}>
                Strategy lab
              </span>
            </span>
          </Link>
          <nav className="rail-nav" aria-label="Main navigation" style={{ marginTop: 18 }}>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rail-link${active(item.href) ? " active" : ""}`}
                aria-current={active(item.href) ? "page" : undefined}
              >
                <item.icon size={16} aria-hidden />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="rail-footer">
          <Link href="/strategies/new" className="btn btn-primary btn-sm" style={{ width: "100%" }}>
            <Sparkles size={14} aria-hidden />
            Start a strategy
          </Link>
          <div className="tiny faint" style={{ padding: "4px 2px" }}>
            Simulation only. No live orders.
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <nav className="crumbs" aria-label="Breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={12} aria-hidden />
              <strong>{titleFor(pathname)}</strong>
            </nav>
          </div>
          <div className="topbar-right">
            {user?.isDemo ? <span className="badge badge-accent">Demo account</span> : null}
            <ThemeToggle />
            <Link href="/account" className="icon-btn" aria-label="Account settings">
              <Settings size={16} aria-hidden />
            </Link>
          </div>
        </header>
        {children}
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={active(item.href) ? "active" : ""}
              aria-current={active(item.href) ? "page" : undefined}
            >
              <item.icon size={18} aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
