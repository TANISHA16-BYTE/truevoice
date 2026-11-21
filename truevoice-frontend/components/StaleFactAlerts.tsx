"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, Clock, Loader2, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/SessionContext";

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

const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const;

function daysSince(dateStr?: string): number {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Number.isNaN(diff) ? 0 : Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function StaleFactAlerts({ maxAgeDays = 60 }: { maxAgeDays?: number }) {
  const { user } = useSession();
  const isAdmin = (user?.role ?? "").toLowerCase() === "admin";
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justChecked, setJustChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);

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
      timersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // Keep items visible briefly during the green check-off celebration before sliding out
  const visibleStale = items.filter(
    (item) =>
      justChecked[item.id] ||
      item.is_stale === true ||
      daysSince(item.last_checked_at) > maxAgeDays
  );

  // Actual remaining count (decrements immediately when checked)
  const remainingCount = items.filter(
    (item) =>
      !justChecked[item.id] &&
      (item.is_stale === true || daysSince(item.last_checked_at) > maxAgeDays)
  ).length;

  async function markRechecked(id: string) {
    if (!isAdmin) return;
    const today = new Date().toISOString().slice(0, 10);
    setSavingId(id);
    setError(null);
    try {
      await api(`/library/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { last_checked_at: today },
      });

      // Flash sage-green check state, then update item so AnimatePresence exits smoothly
      setJustChecked((prev) => ({ ...prev, [id]: true }));
      setSavingId(null);

      const timer = window.setTimeout(() => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, last_checked_at: today, is_stale: false } : item
          )
        );
        setJustChecked((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 550);

      timersRef.current.push(timer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update last checked date.");
      setSavingId(null);
    }
  }

  if (!loaded) return null;

  const allClear = visibleStale.length === 0;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EDITORIAL_EASE }}
      className={`rounded-2xl border p-4 shadow-sm transition-colors duration-500 sm:p-5 ${
        allClear
          ? "border-[#b9d9c2] bg-[#f4faf5]"
          : "border-[var(--tv-champagne)] bg-gradient-to-br from-[#fbf7f0] to-[#f4ead9]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {remainingCount > 0 ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c98000] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#c98000]" />
            </span>
          ) : (
            <CheckCircle2 className="h-4 w-4 text-[var(--tv-ok)]" />
          )}
          <h2 className="font-serif text-lg font-semibold text-[var(--tv-ink)]">
            Approved fact freshness alerts
          </h2>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold transition-colors duration-300 ${
            remainingCount === 0
              ? "border-[#b9d9c2] bg-white text-[#1f6b3a]"
              : "border-[var(--tv-champagne)] bg-white text-[#7a4b00]"
          }`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={remainingCount}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
              className="tabular-nums"
            >
              {remainingCount}
            </motion.span>
          </AnimatePresence>
          <span>need re-checking (&gt;{maxAgeDays}d)</span>
        </span>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 text-xs font-medium text-[#9b1c13]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {allClear ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#1f6b3a]"
        >
          <Check className="h-3.5 w-3.5" />
          All approved sources and facts are up to date.
        </motion.p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          <AnimatePresence mode="popLayout">
            {visibleStale.map((item, idx) => {
              const isChecked = Boolean(justChecked[item.id]);
              const isSaving = savingId === item.id;
              const ageDays = daysSince(item.last_checked_at);

              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: isChecked ? 0.99 : 1,
                  }}
                  exit={{
                    opacity: 0,
                    x: 32,
                    scale: 0.96,
                    transition: { duration: 0.28, ease: EDITORIAL_EASE },
                  }}
                  transition={{
                    layout: { duration: 0.3, ease: EDITORIAL_EASE },
                    opacity: { duration: 0.25, delay: idx * 0.04 },
                    y: { duration: 0.25, delay: idx * 0.04, ease: EDITORIAL_EASE },
                  }}
                  whileHover={!isChecked ? { y: -2 } : undefined}
                  className={`flex flex-col items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs shadow-xs transition-colors duration-300 sm:flex-row sm:items-center ${
                    isChecked
                      ? "border-[#9fd1ae] bg-[#eef7f0]"
                      : "border-[var(--tv-champagne)] bg-white hover:border-[var(--tv-brand)]/35"
                  }`}
                >
                  <div className="min-w-0">
                    <p
                      className={`break-words font-semibold transition-all duration-300 ${
                        isChecked
                          ? "text-[#1f6b3a] line-through decoration-[#1f6b3a]/50"
                          : "text-[var(--tv-ink)]"
                      }`}
                    >
                      {item.title ?? item.name ?? item.fact ?? item.text ?? item.id}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--tv-muted)]">
                      <span>
                        Owner: <strong className="text-[var(--tv-ink)]">{item.owner ?? "Unassigned"}</strong>
                      </span>
                      {item.last_checked_at && (
                        <>
                          <span>&middot;</span>
                          <span>Last checked: {formatShortDate(item.last_checked_at)}</span>
                          {!isChecked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#f9ddd9] px-2 py-0.5 text-[11px] font-semibold text-[#9b1c13] tabular-nums">
                              <Clock className="h-3 w-3" />
                              {ageDays}d ago
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {isAdmin ? (
                    <motion.button
                      type="button"
                      whileTap={!isChecked && !isSaving ? { scale: 0.95 } : undefined}
                      disabled={isSaving || isChecked}
                      onClick={() => markRechecked(item.id)}
                      className={`inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 font-semibold transition-all duration-200 sm:w-auto ${
                        isChecked
                          ? "bg-[#1f6b3a] text-white"
                          : "bg-[var(--tv-brand)] text-white hover:bg-[var(--tv-brand-ink)] disabled:opacity-60"
                      }`}
                    >
                      {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {isChecked && <Check className="h-3.5 w-3.5" />}
                      <span>
                        {isChecked
                          ? "Re-checked"
                          : isSaving
                            ? "Updating…"
                            : "Mark re-checked today"}
                      </span>
                    </motion.button>
                  ) : (
                    <span className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--tv-line)] bg-[var(--tv-paper)] px-3 py-1.5 text-[11px] font-medium text-[var(--tv-muted)] sm:w-auto">
                      <Lock className="h-3 w-3 text-[var(--tv-brand)]" />
                      Admin re-check required
                    </span>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </motion.section>
  );
}