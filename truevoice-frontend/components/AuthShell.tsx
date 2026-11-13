import type { ReactNode } from "react";

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
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <aside className="hidden flex-col justify-center gap-8 bg-[var(--tv-brand)] p-12 text-white lg:flex">
        <h2 className="max-w-md text-4xl font-semibold">Check it before you publish it.</h2>
        <p className="max-w-md text-lg text-white/90">
          TrueVoice compares a draft with your approved facts, prices and rules. Every finding shows
          its source, and a person makes the final decision.
        </p>

        <figure
          aria-label="Example finding"
          className="max-w-md rounded-lg bg-white p-5 text-[var(--tv-ink)]"
        >
          <p className="text-sm text-[var(--tv-muted)]">Draft</p>
          <p className="mt-1">
            Launching Friday with{" "}
            <s className="decoration-[var(--tv-flag)] decoration-2">flat 30% off</s>!
          </p>
          <p className="mt-4 font-semibold text-[var(--tv-flag)]">Offer doesn&rsquo;t match</p>
          <p className="mt-1 text-sm">
            Source: approved offer sheet says 20% off, valid 20&ndash;30 Nov 2026.
          </p>
          <p className="mt-1 text-sm">Suggested fix: &ldquo;Flat 20% off.&rdquo;</p>
          <figcaption className="mt-4 text-xs text-[var(--tv-muted)]">Example with demo data</figcaption>
        </figure>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <p className="font-serif text-2xl font-semibold text-[var(--tv-brand)]">TrueVoice</p>
          <h1 className="mt-8 text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-[var(--tv-muted)]">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}