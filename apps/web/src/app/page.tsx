"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/components/session";

export default function IndexPage() {
  const { user, isLoading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? "/dashboard" : "/sign-in");
  }, [isLoading, router, user]);
  return (
    <main className="page" aria-busy="true">
      <h1>Quantify</h1>
      <p className="muted">Opening your workspace…</p>
      <p className="small muted" style={{ marginTop: 16 }}>
        If nothing happens,{" "}
        <Link href="/sign-in" className="table-link">
          sign in
        </Link>
        .
      </p>
    </main>
  );
}
