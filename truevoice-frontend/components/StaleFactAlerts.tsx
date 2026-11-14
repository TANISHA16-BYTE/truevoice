"use client";

import { useState } from "react";

export type ApprovedFactAlert = {
  id: string;
  fact: string;
  owner: string;
  lastChecked: string; // YYYY-MM-DD
};

const INITIAL_FACTS: ApprovedFactAlert[] = [
  {
    id: "fact-offer-sheet",
    fact: "Offer Sheet: Flat 20% off serum (valid 20–30 Nov 2026)",
    owner: "Tanisha",
    lastChecked: "2026-11-01",
  },
  {
    id: "fact-delivery",
    fact: "Free shipping threshold: orders above ₹999",
    owner: "Riddhi",
    lastChecked: "2026-06-18",
  },
  {
    id: "fact-clinical",
    fact: "Hyaluronic acid hydration claim (Study #GL-14)",
    owner: "Nupur",
    lastChecked: "2026-07-05",
  },
];

function daysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function StaleFactAlerts({ maxAgeDays = 60 }: { maxAgeDays?: number }) {
  const [facts, setFacts] = useState<ApprovedFactAlert[]>(INITIAL_FACTS);

  const stale = facts.filter((f) => daysSince(f.lastChecked) > maxAgeDays);

  function markRechecked(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    setFacts((prev) => prev.map((f) => (f.id === id ? { ...f, lastChecked: today } : f)));
  }

  return (
    <section className="animate-pop-in rounded-2xl border border-amber-300 bg-amber-50/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {stale.length > 0 && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-600 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-700" />
            </span>
          )}
          <h2 className="font-serif text-lg font-semibold text-[var(--tv-ink)]">
            Approved fact freshness alerts
          </h2>
        </div>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-amber-900">
          {stale.length} need re-checking (&gt;{maxAgeDays}d)
        </span>
      </div>

      {stale.length === 0 ? (
        <p className="mt-3 text-xs font-medium text-[#1f6b3a]">
          &#10003; All approved facts were verified within the last {maxAgeDays} days.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {stale.map((item) => (
            <li
              key={item.id}
              className="animate-pop-in flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-xs"
            >
              <div>
                <p className="font-semibold text-[var(--tv-ink)]">{item.fact}</p>
                <p className="mt-0.5 text-[var(--tv-muted)]">
                  Owner: <strong>{item.owner}</strong> &middot; Last checked:{" "}
                  <span className="font-semibold text-[#9b1c13]">
                    {item.lastChecked} ({daysSince(item.lastChecked)} days ago)
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => markRechecked(item.id)}
                className="rounded-lg bg-[var(--tv-brand)] px-3 py-1.5 font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] active:scale-95"
              >
                Mark re-checked today
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}