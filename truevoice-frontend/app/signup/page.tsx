"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell, { buttonClass, fieldClass } from "@/components/AuthShell";
import { signup } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup(name, email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create an account" subtitle="Join your team's workspace.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="font-medium">
            Name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        </div>
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
            autoComplete="new-password"
            required
            minLength={8}
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
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-8 text-sm">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[var(--tv-brand)] underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}