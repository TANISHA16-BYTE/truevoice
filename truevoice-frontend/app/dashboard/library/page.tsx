"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Item = Record<string, unknown>;

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

type Result = { tab: string; items: Item[]; error: string | null };

export default function LibraryPage() {
  const [tab, setTab] = useState("facts");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<unknown>(`/library/${tab}`)
      .then((data) => {
        if (!cancelled) setResult({ tab, items: toList(data), error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({
            tab,
            items: [],
            error: err instanceof Error ? err.message : "Could not load this list.",
          });
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

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold sm:text-4xl">Library</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--tv-muted)] sm:text-base">
        The approved facts, prices, offers and rules that every draft is checked against.
      </p>

      <div role="group" aria-label="Library sections" className="mt-5 flex flex-wrap gap-2 sm:mt-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={t.key === tab}
            onClick={() => {
              setTab(t.key);
              setQuery("");
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium sm:px-4 sm:py-2 sm:text-sm ${
              t.key === tab
                ? "bg-[var(--tv-brand)] text-white"
                : "border border-[var(--tv-edge)] hover:bg-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">{current.label}</h2>
          <p className="text-sm text-[var(--tv-muted)]">{current.help}</p>
        </div>
        <div className="w-full sm:w-72">
          <label htmlFor="library-search" className="text-sm font-medium">
            Search this list
          </label>
          <input
            id="library-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mt-1 block w-full rounded-md border border-[var(--tv-edge)] bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      {loading && <p className="mt-6 text-[var(--tv-muted)]">Loading…</p>}

      {!loading && result?.error && (
        <p role="alert" className="mt-6 text-[var(--tv-flag)]">
          {result.error}
        </p>
      )}

      {!loading && !result?.error && shown.length === 0 && (
        <p className="mt-6 rounded-md border border-dashed border-[var(--tv-edge)] p-4">
          {items.length === 0 ? "Nothing in this list yet." : "No items match your search."}
        </p>
      )}

      {!loading && shown.length > 0 && (
        <>
          <p className="mt-6 text-sm text-[var(--tv-muted)]">
            Showing {shown.length} of {items.length}
          </p>
          <ul className="mt-2 divide-y divide-[var(--tv-line)] rounded-xl border border-[var(--tv-line)] bg-white">
            {shown.map((item, i) => {
              const { keys, text } = titleOf(item);
              const details = Object.entries(item)
                .filter(([k]) => !keys.includes(k) && k !== "id")
                .slice(0, 8);
              return (
                <li key={`${i}-${String(item.id ?? "")}`} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <p className="min-w-0 flex-1 break-words font-medium">{text}</p>
                    {needsRecheck(item) && (
                      <span className="rounded-full bg-[#f6e7c8] px-3 py-0.5 text-xs font-semibold text-[#7a4b00] sm:text-sm">
                        Needs re-check
                      </span>
                    )}
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                    {details.map(([k, v]) => (
                      <div key={k} className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
                        <dt className="shrink-0 text-[var(--tv-muted)]">
                          {k.replace(/_inr$/, "").replace(/_/g, " ")}:
                        </dt>
                        <dd className="min-w-0 break-words">{formatValue(v, k)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-8 text-sm text-[var(--tv-muted)]">
        Adding, editing and archiving items comes once the backend has routes for them.
      </p>
    </div>
  );
}