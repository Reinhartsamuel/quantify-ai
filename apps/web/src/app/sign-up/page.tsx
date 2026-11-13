"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { useSession } from "@/components/session";
import { api, isApiError } from "@/lib/api";

export default function SignUpPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("Use at least 10 characters for your password.");
      return;
    }
    setPending(true);
    try {
      await api.signUp({ email, password, ...(name ? { name } : {}) });
      await refresh();
      router.replace("/dashboard");
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : "Could not create the account. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Create an account"
      subtitle="Your strategies and results are private to this account."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="table-link">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="stack-sm" noValidate>
        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="name">Name (optional)</label>
          <input
            id="name"
            className="input"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="password-hint"
          />
          <span id="password-hint" className="field-hint">
            At least 10 characters. Use a unique password.
          </span>
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
