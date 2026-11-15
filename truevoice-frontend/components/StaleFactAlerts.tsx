"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type LibraryItem = {
  id: string;
  title?: string;
  name?: string;
  text?: string;
  fact?: string;
  owner?: string;
  last_checked_at?: string;
  is_stale?: boolean;
};

type LibraryResponse = {
  sources?: LibraryItem[];
  facts?: LibraryItem[];
  items?: LibraryItem[];
};

function daysSince(dateStr?: string): number {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Number.isNaN(diff) ? 0 : Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function StaleFactAlerts({ maxAgeDays = 60 }: { maxAgeDays?: number }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<LibraryResponse>("/library")
      .then((res) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const combined: LibraryItem[] = [];
        for (const entry of [
          ...(res.sources ?? []),
          ...(res.facts ?? []),
          ...(res.items ?? []),
        ]) {
          if (entry?.id && !seen.has(entry.id)) {
            seen.add(entry.id);
            combined.push(entry);
          }
        }
        setItems(combined);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stale = items.filter(
    (item) => item.is_stale === true || daysSince(item.last_checked_at) > maxAgeDays
  );

  async function markRechecked(id: string) {
    const today = new Date().toISOString().slice(0, 10);
    setSavingId(id);
    setError(null);
    try {
      await api(`/library/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { last_checked_at: today },
      });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, last_checked_at: today, is_stale: false } : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update last checked date.");
    } finally {
      setSavingId(null);
    }
  }

  if (!loaded) return null;

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

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-[#9b1c13]">
          {error}
        </p>
      )}

      {stale.length === 0 ? (
        <p className="mt-3 text-xs font-medium text-[#1f6b3a]">
          &#10003; All approved sources and facts are up to date.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {stale.map((item) => (
            <li
              key={item.id}
              className="animate-pop-in flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-xs"
            >
              <div>
                <p className="font-semibold text-[var(--tv-ink)]">
                  {item.title ?? item.name ?? item.fact ?? item.text ?? item.id}
                </p>
                <p className="mt-0.5 text-[var(--tv-muted)]">
                  Owner: <strong>{item.owner ?? "Unassigned"}</strong>
                  {item.last_checked_at && (
                    <>
                      {" "}
                      &middot; Last checked:{" "}
                      <span className="font-semibold text-[#9b1c13]">
                        {item.last_checked_at} ({daysSince(item.last_checked_at)} days ago)
                      </span>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={savingId === item.id}
                onClick={() => markRechecked(item.id)}
                className="rounded-lg bg-[var(--tv-brand)] px-3 py-1.5 font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] disabled:opacity-60"
              >
                {savingId === item.id ? "Updating…" : "Mark re-checked today"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}