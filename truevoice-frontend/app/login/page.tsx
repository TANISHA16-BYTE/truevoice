"use client";

import Logo from "@/components/Logo";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1a070e] px-4 py-8 text-white sm:py-10">
      {/* Drifting Aurora Lights */}
      <div
        aria-hidden="true"
        className="animate-aurora pointer-events-none absolute -left-32 -top-28 h-[460px] w-[460px] rounded-full bg-[#8f2148]/55 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="animate-aurora-reverse pointer-events-none absolute -bottom-32 -right-24 h-[440px] w-[440px] rounded-full bg-[#d9bc98]/25 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6e1f3d]/30 blur-[120px]"
      />

      {/* Frosted Dark Glass Card */}
      <section className="animate-pop-in relative z-10 w-full max-w-[390px] rounded-2xl border border-white/15 bg-white/[0.06] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-7">
        {/* Brand */}
        <div className="flex items-center gap-2 text-[#e8d4b7]">
          <Logo />
        </div>

        {/* Tagline + Heading */}
        <p className="mt-4 font-serif text-xl font-bold leading-snug text-white sm:text-2xl">
          Check it before you publish it.
        </p>

        <h1 className="mt-4 font-serif text-lg font-bold text-white sm:text-xl">Log in</h1>
        <p className="mt-1 text-xs text-white/70">
          Use your work email to check drafts before they go live.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-white/90">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setActiveDemo(null);
              }}
              className="mt-1.5 w-full rounded-lg border border-white/20 bg-black/25 px-3.5 py-2.5 text-sm text-white placeholder-white/35 outline-none transition focus:border-[#d9bc98] focus:bg-black/35 focus:ring-2 focus:ring-[#d9bc98]/25"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-white/90">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setActiveDemo(null);
              }}
              className="mt-1.5 w-full rounded-lg border border-white/20 bg-black/25 px-3.5 py-2.5 text-sm text-white placeholder-white/35 outline-none transition focus:border-[#d9bc98] focus:bg-black/35 focus:ring-2 focus:ring-[#d9bc98]/25"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="animate-pop-in rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-200"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[#d9bc98] py-2.5 text-sm font-semibold text-[#230a12] shadow-md transition hover:bg-[#e5cba9] active:scale-[0.985] disabled:opacity-60"
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#230a12]/30 border-t-[#230a12]" />
            )}
            <span>{loading ? "Logging in…" : "Log in"}</span>
          </button>
        </form>

        {/* Demo Accounts */}
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-[11px] text-white/65">Demo accounts (made-up data)</p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            {demoAccounts.map((account) => {
              const selected = activeDemo === account.label;
              return (
                <button
                  key={account.label}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    setActiveDemo(account.label);
                    setError(null);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-center text-xs font-medium transition active:scale-95 ${
                    selected
                      ? "border-[#d9bc98] bg-[#d9bc98]/20 text-[#f3dfc4]"
                      : "border-white/20 bg-white/[0.04] text-white/85 hover:bg-white/10"
                  }`}
                >
                  {account.label}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-white/65">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-[#d9bc98] underline hover:text-[#e8d4b7]">
            Sign up
          </Link>
        </p>
      </section>
    </main>
  );
}