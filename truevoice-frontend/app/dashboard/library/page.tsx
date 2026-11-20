"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { api } from "@/lib/api";

type Item = Record<string, unknown>;

const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const;

const tabs = [
  { key: "facts", label: "Facts", help: "Approved product facts." },
  { key: "prices", label: "Prices", help: "Current and outdated prices." },
  { key: "offers", label: "Offers", help: "Active and expired promotions." },
  { key: "claims", label: "Claims", help: "Approved, restricted and prohibited claims." },
  { key: "terms", label: "Terms", help: "Banned and retired wording." },
  { key: "rules", label: "Rules", help: "Brand guideline rules." },
  { key: "sources", label: "Sources", help: "Where each fact comes from, and when it was last checked." },
];

function isItem(value: unknown): value is Item {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The backend sends an object that holds the list, like { "prices": [ ... ] }.
function toList(data: unknown): Item[] {
  if (Array.isArray(data)) return data.filter(isItem);
  if (isItem(data)) {
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) return value.filter(isItem);
    }
  }
  return [];
}

function formatValue(value: unknown, key = ""): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number" && key.endsWith("_inr")) {
    return `₹${value.toLocaleString("en-IN")}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(parsed);
    }
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function titleOf(item: Item): { keys: string[]; text: string } {
  // Facts read best as "origin: Made in India".
  if (typeof item.fact_key === "string" && item.fact_value !== undefined) {
    return {
      keys: ["fact_key", "fact_value"],
      text: `${item.fact_key.replace(/_/g, " ")}: ${formatValue(item.fact_value)}`,
    };
  }

  // Other lists: use the first text field that looks like a title.
  const texts = Object.entries(item).filter(([, v]) => typeof v === "string" && v !== "");
  const isCodeOrDate = (k: string) => /(^|_)id$|code|date/.test(k);
  const pick = (pattern: RegExp) => texts.find(([k]) => pattern.test(k) && !isCodeOrDate(k));
  const found =
    pick(/name|title|text|description|claim|term|rule/) ??
    pick(/value|label|key/) ??
    texts.find(([k]) => /id$/.test(k));

  if (found) return { keys: [found[0]], text: String(found[1]) };
  return { keys: [], text: "(untitled)" };
}

function needsRecheck(item: Item): boolean {
  const words = /stale|expired|outdated|overdue/i;
  return Object.entries(item).some(([key, value]) => {
    if (typeof value === "boolean") return value && words.test(key);
    if (typeof value === "string" && /^(status|state|freshness)$/i.test(key)) return words.test(value);
    return false;
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const regex = new RegExp(`(${escapeRegExp(q)})`, "ig");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="rounded-xs bg-[#EFE5CE] px-0.5 font-semibold text-[var(--tv-brand)]"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

type Result = { tab: string; items: Item[]; error: string | null };

export default function LibraryPage() {
  const [tab, setTab] = useState("facts");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<unknown>(`/library/${tab}`)
      .then((data) => {
        if (!cancelled) {
          setResult({ tab, items: toList(data), error: null });
          setSelectedIdx(0);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({
            tab,
            items: [],
            error: err instanceof Error ? err.message : "Could not load this list.",
          });
          setSelectedIdx(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const loading = result?.tab !== tab;
  const items = loading || !result ? [] : result.items;
  const shown = items.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
  );

  const safeIdx = shown.length > 0 ? Math.min(selectedIdx, shown.length - 1) : 0;
  const selectedItem = shown[safeIdx] ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EDITORIAL_EASE }}
      >
        <h1 className="text-2xl font-semibold sm:text-4xl">Library</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--tv-muted)] sm:text-base">
          The approved facts, prices, offers and rules that every draft is checked against.
        </p>
      </motion.div>

      {/* Sliding Pill Category Tabs */}
      <div
        role="group"
        aria-label="Library sections"
        className="mt-5 flex flex-wrap gap-2 sm:mt-6"
      >
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setTab(t.key);
                setQuery("");
                setSelectedIdx(0);
              }}
              className={`relative rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                active
                  ? "text-white"
                  : "border border-[var(--tv-edge)] bg-white/70 text-[var(--tv-ink)] hover:bg-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="library-tab-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-full bg-[var(--tv-brand)] shadow-xs"
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subheader + Search */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">{current.label}</h2>
          <p className="text-sm text-[var(--tv-muted)]">{current.help}</p>
        </div>
        <div className="w-full sm:w-80">
          <label htmlFor="library-search" className="text-sm font-medium">
            Search this list
          </label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tv-muted)]" />
            <input
              id="library-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIdx(0);
              }}
              placeholder={`Filter ${current.label.toLowerCase()}…`}
              className="block w-full rounded-xl border border-[var(--tv-edge)] bg-white py-2 pl-9 pr-8 text-sm outline-none transition focus:border-[var(--tv-brand)] focus:ring-2 focus:ring-[var(--tv-brand)]/15"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setSelectedIdx(0);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--tv-muted)] hover:bg-[var(--tv-paper)] hover:text-[var(--tv-ink)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="mt-6 grid gap-5 lg:grid-cols-12">
          <div className="space-y-2.5 lg:col-span-5">
            {[0, 1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-16 animate-pulse rounded-xl border border-[var(--tv-line)] bg-white/70"
              />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-2xl border border-[var(--tv-champagne)] bg-white/70 lg:col-span-7" />
        </div>
      )}

      {!loading && result?.error && (
        <p role="alert" className="mt-6 text-[var(--tv-flag)]">
          {result.error}
        </p>
      )}

      {!loading && !result?.error && shown.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-[var(--tv-edge)] bg-white/60 p-5 text-sm text-[var(--tv-muted)]">
          {items.length === 0 ? "Nothing in this list yet." : "No items match your search."}
        </p>
      )}

      {!loading && shown.length > 0 && selectedItem && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-[var(--tv-muted)]">
            Showing <strong className="text-[var(--tv-ink)]">{shown.length}</strong> of{" "}
            {items.length} &middot; Hover or click an entry to inspect its passport
          </p>

          {/* Split-View Master-Detail */}
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            {/* Left Master Index List */}
            <ul
              aria-label={`${current.label} index`}
              className="order-2 divide-y divide-[var(--tv-line)] overflow-hidden rounded-2xl border border-[var(--tv-line)] bg-white shadow-sm lg:order-1 lg:col-span-5 lg:max-h-[38rem] lg:overflow-y-auto"
            >
              {shown.map((item, i) => {
                const { keys, text } = titleOf(item);
                const isSelected = i === safeIdx;
                const stale = needsRecheck(item);

                // Pick up to 2 concise badge chips for the index row
                const chips = Object.entries(item)
                  .filter(
                    ([k, v]) =>
                      !keys.includes(k) &&
                      k !== "id" &&
                      v !== null &&
                      v !== undefined &&
                      v !== "" &&
                      /(^|_)(id|code)$|status/i.test(k)
                  )
                  .slice(0, 2);

                return (
                  <li key={`${i}-${String(item.id ?? "")}`} className="relative">
                    {isSelected && (
                      <motion.span
                        layoutId="library-active-bar"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-[var(--tv-brand)]"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedIdx(i)}
                      onMouseEnter={() => setSelectedIdx(i)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors ${
                        isSelected
                          ? "bg-[#fbf7f0]"
                          : "hover:bg-[#fcf9f3]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-semibold ${
                            isSelected ? "text-[var(--tv-brand)]" : "text-[var(--tv-ink)]"
                          }`}
                        >
                          <HighlightMatch text={text} query={query} />
                        </p>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {chips.map(([k, v]) => (
                            <span
                              key={k}
                              className="rounded-md border border-[var(--tv-line)] bg-white px-1.5 py-0.5 text-[var(--tv-muted)]"
                            >
                              {k.replace(/_/g, " ")}:{" "}
                              <strong className="font-medium text-[var(--tv-ink)]">
                                <HighlightMatch text={formatValue(v, k)} query={query} />
                              </strong>
                            </span>
                          ))}
                          {stale && (
                            <span className="rounded-full bg-[#f6e7c8] px-2 py-0.5 font-semibold text-[#7a4b00]">
                              Needs re-check
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                          isSelected
                            ? "translate-x-0.5 text-[var(--tv-brand)]"
                            : "text-[var(--tv-muted)]/60"
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Right Sticky "Approved Fact Passport" */}
            <div className="order-1 lg:sticky lg:top-6 lg:order-2 lg:col-span-7">
              <AnimatePresence mode="wait">
                {(() => {
                  const { keys, text } = titleOf(selectedItem);
                  const stale = needsRecheck(selectedItem);
                  const details = Object.entries(selectedItem).filter(
                    ([k]) => !keys.includes(k) && k !== "id"
                  );
                  const passportKey = `${tab}-${safeIdx}-${String(selectedItem.id ?? text)}`;
                  const statusText =
                    typeof selectedItem.status === "string" && selectedItem.status.trim()
                      ? selectedItem.status.toUpperCase()
                      : "APPROVED";

                  return (
                    <motion.aside
                      key={passportKey}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.22, ease: EDITORIAL_EASE }}
                      aria-label="Selected item passport"
                      className="relative overflow-hidden rounded-3xl border-2 border-[var(--tv-champagne)] bg-white shadow-[0_18px_45px_-25px_rgba(88,24,46,0.22)]"
                    >
                      {/* Passport Top Strip */}
                      <div className="flex items-center justify-between border-b border-[var(--tv-line)] bg-gradient-to-r from-[#fbf7f0] to-[#f4ead9] px-5 py-3.5 sm:px-6">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--tv-brand)]">
                          <BookOpen className="h-3.5 w-3.5" />
                          {current.label.replace(/s$/, "")} Passport
                        </span>

                        {/* Animated Editorial Verification Stamp */}
                        <motion.span
                          initial={{ scale: 1.3, rotate: -12, opacity: 0 }}
                          animate={{ scale: 1, rotate: -3, opacity: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 22,
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider shadow-xs ${
                            stale
                              ? "border-[#c98000]/45 bg-[#f6e7c8] text-[#7a4b00]"
                              : "border-[var(--tv-brand)]/35 bg-white text-[var(--tv-brand)]"
                          }`}
                        >
                          {stale ? (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          ) : (
                            <BadgeCheck className="h-3.5 w-3.5 text-[#1f6b3a]" />
                          )}
                          {stale ? "Needs Re-Check" : `Verified · ${statusText}`}
                        </motion.span>
                      </div>

                      {/* Passport Body */}
                      <div className="p-5 sm:p-6">
                        <h3 className="font-serif text-xl font-semibold leading-snug text-[var(--tv-ink)] sm:text-2xl">
                          <HighlightMatch text={text} query={query} />
                        </h3>

                        {details.length > 0 && (
                          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                            {details.map(([k, v]) => (
                              <div
                                key={k}
                                className="rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/55 px-3.5 py-2.5"
                              >
                                <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                                  {k.replace(/_inr$/, "").replace(/_/g, " ")}
                                </dt>
                                <dd className="mt-0.5 break-words text-sm font-medium text-[var(--tv-ink)]">
                                  <HighlightMatch text={formatValue(v, k)} query={query} />
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>

                      {/* Passport Footer */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--tv-line)] bg-[#fcf9f3] px-5 py-3 text-xs text-[var(--tv-muted)] sm:px-6">
                        <span>
                          Record {safeIdx + 1} of {shown.length}
                        </span>
                        {typeof selectedItem.id === "string" && selectedItem.id && (
                          <span className="font-mono text-[11px]">ID: {selectedItem.id}</span>
                        )}
                      </div>
                    </motion.aside>
                  );
                })()}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      <p className="mt-8 text-sm text-[var(--tv-muted)]">
        Adding, editing and archiving items comes once the backend has routes for them.
      </p>
    </div>
  );
}