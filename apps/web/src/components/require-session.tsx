"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "./session";

export function RequireSession({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/sign-in");
  }, [isLoading, router, user]);

  if (isLoading) {
    return (
      <div className="page" role="status">
        <span className="sr-only">Loading…</span>
        <div className="stack">
          <div className="skeleton" style={{ width: 220, height: 32 }} />
          <div className="skeleton" style={{ width: "100%", height: 120 }} />
          <div className="skeleton" style={{ width: "100%", height: 220 }} />
        </div>
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
