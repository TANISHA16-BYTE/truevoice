import type { ReactNode } from "react";
import Logo from "./Logo";

// Shared styles so login and signup look the same.
export const fieldClass =
  "mt-1 block w-full rounded-md border border-[var(--tv-edge)] bg-white px-3 py-2 text-base text-[var(--tv-ink)]";

export const buttonClass =
  "w-full rounded-md bg-[var(--tv-brand)] px-4 py-2.5 font-medium text-white hover:bg-[var(--tv-brand-ink)] disabled:opacity-60";

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--tv-brand-ink)] p-6">
      <Logo className="text-3xl text-[var(--tv-champagne)]" />

      <div className="w-full max-w-md rounded-2xl border-t-8 border-[var(--tv-champagne)] bg-[var(--tv-paper)] p-8">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-[var(--tv-muted)]">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>

      <p className="font-serif text-xl text-[var(--tv-champagne)]">
        Check it before you publish it.
      </p>
    </main>
  );
}