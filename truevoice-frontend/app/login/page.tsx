"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell, { buttonClass, fieldClass } from "@/components/AuthShell";
import { login } from "@/lib/api";
import { getSession } from "@/lib/session";

// Demo data only. Remove these quick-fill buttons before any real use.
const demoAccounts = [
  { label: "Creator", email: "tanisha@glowvale.demo", password: "creator123" },
  { label: "Reviewer", email: "riddhi@glowvale.demo", password: "reviewer123" },
  { label: "Admin", email: "manager@glowvale.demo", password: "admin123" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already logged in? Go straight to the dashboard.
  useEffect(() => {
    if (getSession()) router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Log in" subtitle="Use your work email to check drafts before they go live.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>

        {error && (
          <p role="alert" className="text-[var(--tv-flag)]">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={buttonClass}>
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-[var(--tv-muted)]">Demo accounts (made-up data):</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {demoAccounts.map((account) => (
          <button
            key={account.label}
            type="button"
            onClick={() => {
              setEmail(account.email);
              setPassword(account.password);
            }}
            className="rounded-md border border-[var(--tv-edge)] px-3 py-1.5 text-sm hover:bg-white"
          >
            Fill in {account.label.toLowerCase()}
          </button>
        ))}
      </div>

      <p className="mt-8 text-sm">
        New here?{" "}
        <Link href="/signup" className="font-medium text-[var(--tv-brand)] underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}