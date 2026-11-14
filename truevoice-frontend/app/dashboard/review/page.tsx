"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProofOfApprovalBadge } from "@/components/ProofOfApprovalBadge";
import { api } from "@/lib/api";

type Draft = {
  id: string;
  title?: string;
  channel?: string | null;
  status?: string;
  risk_level?: string;
  total_findings?: number;
  high_severity_findings?: number;
  handover_to_manager?: number;
};

type FilterKey = "ALL" | "HIGH" | "MEDIUM" | "LOW";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "HIGH", label: "High" },
  { key: "MEDIUM", label: "Medium" },
  { key: "LOW", label: "Low" },
];

const riskStyle: Record<string, string> = {
  HIGH: "bg-[#f9ddd9] text-[#9b1c13]",
  MEDIUM: "bg-[#f6e7c8] text-[#7a4b00]",
  LOW: "bg-[#ddebdd] text-[#1f6b3a]",
};

const riskRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function stageIndex(status = ""): number {
  const s = status.toLowerCase();
  if (s.includes("approv")) return 2;
  if (s.includes("review")) return 1;
  return 0;
}

export default function ReviewPage() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [decisions, setDecisions] = useState<
    Record<string, { action: "Approved" | "Changes requested"; note: string; at: string }>
  >({});

  useEffect(() => {
    let cancelled = false;
    api<unknown>("/drafts")
      .then((data) => {
        const list = Array.isArray(data) ? data : (data as { drafts?: unknown } | null)?.drafts;
        if (!cancelled) {
          const parsed = Array.isArray(list) ? (list as Draft[]) : [];
          const sorted = [...parsed].sort(
            (a, b) =>
              (riskRank[(a.risk_level ?? "").toUpperCase()] ?? 3) -
              (riskRank[(b.risk_level ?? "").toUpperCase()] ?? 3)
          );
          setDrafts(sorted);
          if (sorted.length > 0) setSelectedId(sorted[0].id);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDrafts([]);
          setError(err instanceof Error ? err.message : "Could not load drafts.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (drafts ?? []).filter((d) =>
    filter === "ALL" ? true : (d.risk_level ?? "").toUpperCase() === filter
  );
  const selected = filtered.find((d) => d.id === selectedId) ?? filtered[0] ?? null;
  const filterIdx = FILTERS.findIndex((f) => f.key === filter);

  function recordDecision(action: "Approved" | "Changes requested") {
    if (!selected) return;
    setDecisions((prev) => ({
      ...prev,
      [selected.id]: {
        action,
        note: comment.trim(),
        at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    }));
    setComment("");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header + Sliding Risk Filter */}
      <div className="animate-pop-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Review queue</h1>
          <p className="mt-1 text-[var(--tv-muted)]">
            Drafts waiting for a human decision, sorted riskiest first.
          </p>
        </div>

        <div className="relative grid grid-cols-4 rounded-full border border-[var(--tv-line)] bg-white p-1 shadow-xs">
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/4)] rounded-full bg-[var(--tv-brand)] transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${filterIdx * 100}%)` }}
          />
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`relative z-10 min-w-[74px] rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  active ? "text-white" : "text-[var(--tv-muted)] hover:text-[var(--tv-ink)]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {drafts === null && <p className="text-[var(--tv-muted)]">Loading drafts…</p>}
      {error && (
        <p role="alert" className="text-[var(--tv-flag)]">
          {error}
        </p>
      )}

      {drafts !== null && filtered.length === 0 && !error && (
        <div className="animate-pop-in rounded-2xl border border-dashed border-[var(--tv-edge)] bg-white p-6 text-sm">
          No drafts match this filter.{" "}
          <Link href="/dashboard/submit" className="font-semibold text-[var(--tv-brand)] underline">
            Check a new draft
          </Link>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left: Queue List */}
          <ul className="space-y-3 lg:col-span-2">
            {filtered.map((d, idx) => {
              const risk = (d.risk_level ?? "").toUpperCase();
              const isSelected = selected?.id === d.id;
              const decision = decisions[d.id];

              return (
                <li
                  key={d.id}
                  style={{ animationDelay: `${idx * 75}ms` }}
                  className="animate-pop-in"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition-all duration-200 ${
                      isSelected
                        ? "translate-x-1 border-[var(--tv-brand)] bg-white shadow-md ring-2 ring-[var(--tv-brand)]/15"
                        : "border-[var(--tv-line)] bg-white/80 hover:bg-white hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-[var(--tv-ink)]">{d.title ?? d.id}</p>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          riskStyle[risk] ?? "bg-[var(--tv-paper)]"
                        }`}
                      >
                        {risk === "HIGH" && (
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#9b1c13] opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#9b1c13]" />
                          </span>
                        )}
                        {risk || "UNKNOWN"}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-[var(--tv-muted)]">
                      {d.channel ?? "No channel"} &middot; {d.total_findings ?? 0} findings
                      {d.handover_to_manager === 1 && " · With manager"}
                    </p>

                    {decision && (
                      <span className="mt-2 inline-block rounded bg-[#ddebdd] px-2 py-0.5 text-[11px] font-semibold text-[#1f6b3a]">
                        &#10003; {decision.action} ({decision.at})
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Right: Animated Decision Inspector */}
          {selected && (
            <section
              key={selected.id}
              className="animate-pop-in rounded-2xl border-2 border-[var(--tv-champagne)] bg-white p-6 shadow-sm lg:col-span-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                    {selected.channel ?? "Draft"}
                  </span>
                  <h2 className="mt-1 text-2xl font-semibold">{selected.title ?? selected.id}</h2>
                </div>

                {decisions[selected.id]?.action === "Approved" && (
                  <div className="animate-pop-in -rotate-3 rounded-lg border-2 border-[#1f6b3a] bg-[#ddebdd] px-3 py-1 text-xs font-bold tracking-wider text-[#1f6b3a]">
                    APPROVED &middot; RECORDED
                  </div>
                )}
              </div>

              {/* Animated Workflow Track */}
              <div className="mt-5 rounded-xl bg-[var(--tv-paper)] p-4">
                <div className="flex items-center justify-between text-xs font-semibold">
                  {(["Creator", "Reviewer", "Approved"] as const).map((step, i) => {
                    const active =
                      decisions[selected.id]?.action === "Approved"
                        ? 2
                        : stageIndex(selected.status);
                    return (
                      <span
                        key={step}
                        className={i <= active ? "text-[var(--tv-brand)]" : "text-[var(--tv-muted)]"}
                      >
                        {step}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-[var(--tv-brand)] transition-all duration-500 ease-out"
                    style={{
                      width: `${
                        (((decisions[selected.id]?.action === "Approved"
                          ? 2
                          : stageIndex(selected.status)) +
                          1) /
                          3) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-[var(--tv-line)] p-3">
                  <span className="text-xs text-[var(--tv-muted)]">Total findings</span>
                  <p className="mt-1 font-serif text-2xl font-semibold">
                    {selected.total_findings ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--tv-line)] p-3">
                  <span className="text-xs text-[var(--tv-muted)]">High severity</span>
                  <p className="mt-1 font-serif text-2xl font-semibold text-[#9b1c13]">
                    {selected.high_severity_findings ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="review-note" className="text-xs font-semibold text-[var(--tv-muted)]">
                  Reviewer note / dismissal reason (saved with decision)
                </label>
                <textarea
                  id="review-note"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional approval note, or reason for requesting changes..."
                  className="mt-1.5 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 p-3 text-sm outline-none focus:border-[var(--tv-brand)]"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => recordDecision("Approved")}
                  className="rounded-xl bg-[#1f6b3a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#17522c] active:scale-95"
                >
                  &#10003; Approve draft
                </button>
                <button
                  type="button"
                  onClick={() => recordDecision("Changes requested")}
                  className="rounded-xl border border-[var(--tv-brand)] px-4 py-2 text-sm font-semibold text-[var(--tv-brand)] transition hover:bg-[var(--tv-paper)] active:scale-95"
                >
                  Request changes
                </button>
              </div>

              {decisions[selected.id] && (
                <p className="animate-pop-in mt-4 rounded-xl bg-[var(--tv-paper)] p-3 text-xs text-[var(--tv-ink)]">
                  <strong>{decisions[selected.id].action}</strong> at{" "}
                  {decisions[selected.id].at}
                  {decisions[selected.id].note && <> &mdash; &ldquo;{decisions[selected.id].note}&rdquo;</>}
                </p>
              )}
              {decisions[selected.id]?.action === "Approved" && (
              <div className="mt-5">
              <ProofOfApprovalBadge
               badgeCode={`TV-${selected.id.slice(0, 6).toUpperCase()}`}
               title={selected.title ?? selected.id}
               approvedBy="Riddhi Sharma (Reviewer)"
               approvedAt={decisions[selected.id].at}
               approvedContent={`Approved draft: ${selected.title ?? selected.id}`}
               />
             </div>
)}
            </section>
          )}
        </div>
      )}
    </div>
  );
}