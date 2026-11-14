"use client";

import { useEffect, useState } from "react";

export interface QueueDraft {
  id: string;
  title: string;
  channel: string;
  stage: "Creator" | "Reviewer" | "Approved";
  risk: "High" | "Medium" | "Low";
  findingsCount: number;
  topFinding?: { label: string; source: string };
}

interface BentoDashboardProps {
  userName: string;
  userRole: string;
  drafts: QueueDraft[];
  staleFactsCount: number;
  onOpenDraft: (id: string) => void;
  onNewDraft: () => void;
}

const RISK_ORDER = { High: 0, Medium: 1, Low: 2 };

export function BentoDashboard({
  userName,
  userRole,
  drafts,
  staleFactsCount,
  onOpenDraft,
  onNewDraft,
}: BentoDashboardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(drafts[0]?.id ?? null);
  const [highRiskFirst, setHighRiskFirst] = useState(true);
  const [ringReady, setRingReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRingReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  const highCount = drafts.filter((d) => d.risk === "High").length;
  const medCount = drafts.filter((d) => d.risk === "Medium").length;
  const lowCount = drafts.filter((d) => d.risk === "Low").length;
  const total = Math.max(drafts.length, 1);

  const highPct = (highCount / total) * 100;
  const circumference = 97.4;
  const targetOffset = circumference - (circumference * highPct) / 100;

  const sortedDrafts = highRiskFirst
    ? [...drafts].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk])
    : drafts;

  return (
    <main className="min-h-screen bg-[#F7F3EA] px-6 py-8 text-[#2E0B17]">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold">Welcome to TrueVoice</h1>
            <p className="mt-1 text-sm text-[#5E4B51]">
              Signed in as <span className="font-semibold">{userName}</span> ({userRole}). Work
              through the review queue, riskiest drafts first.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#D9CEB8] bg-white px-3 py-1 text-xs text-[#5E4B51]">
              ✦ Gemini AI assisted · Human decides
            </span>
            <button
              type="button"
              onClick={onNewDraft}
              className="rounded-xl bg-[#4D1627] px-4 py-2.5 text-sm font-semibold text-[#FAF6EE] shadow-sm transition hover:bg-[#3A0F1D] active:scale-[0.98]"
            >
              + Check a new draft
            </button>
          </div>
        </div>

        {/* Bento Row */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="animate-fade-up rounded-2xl border border-[#E5DEC9] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7A666D]">
              Active Queue
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif text-4xl font-bold text-[#4D1627]">{drafts.length}</span>
              <span className="text-sm text-[#5E4B51]">drafts waiting</span>
            </div>
            <p className="mt-3 text-xs font-medium text-emerald-700">
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
              Backend connected
            </p>
          </div>

          <div
            style={{ animationDelay: "70ms" }}
            className="animate-fade-up flex items-center justify-between rounded-2xl border border-[#E5DEC9] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#7A666D]">
                Risk Breakdown
              </span>
              <ul className="mt-2.5 space-y-1 text-xs font-medium">
                <li className="text-rose-700">● {highCount} High risk</li>
                <li className="text-amber-700">● {medCount} Medium risk</li>
                <li className="text-emerald-700">● {lowCount} Low risk</li>
              </ul>
            </div>
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#EFE8D8" strokeWidth="3.5" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="#E11D48"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={ringReady ? targetOffset : circumference}
                className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
              />
            </svg>
          </div>

          <div
            style={{ animationDelay: "140ms" }}
            className="animate-fade-up rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-900">
              Library Freshness
            </span>
            <p className="mt-2 text-sm font-semibold text-[#2E0B17]">
              {staleFactsCount} approved facts need re-checking
            </p>
            <p className="mt-1 text-xs text-amber-900/80">
              Owners are flagged when facts haven&apos;t been verified recently.
            </p>
          </div>
        </div>

        {/* Expandable Review Queue */}
        <section className="rounded-2xl border border-[#E5DEC9] bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-bold">Review queue</h2>
              <p className="text-xs text-[#7A666D]">Click any row to peek at findings inline</p>
            </div>

            <button
              type="button"
              onClick={() => setHighRiskFirst((v) => !v)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                highRiskFirst
                  ? "border-[#4D1627] bg-[#4D1627] text-[#FAF6EE]"
                  : "border-[#D9CEB8] bg-[#FAF6EE] text-[#4D1627]"
              }`}
            >
              Filter: {highRiskFirst ? "High risk first" : "Default order"}
            </button>
          </div>

          <div className="divide-y divide-[#EFE8D8]">
            {sortedDrafts.map((draft, idx) => {
              const isOpen = expandedId === draft.id;
              const badgeColor =
                draft.risk === "High"
                  ? "bg-rose-100 text-rose-800"
                  : draft.risk === "Medium"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800";

              return (
                <div
                  key={draft.id}
                  style={{ animationDelay: `${idx * 45}ms` }}
                  className="animate-fade-up py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpandedId(isOpen ? null : draft.id)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      <svg
                        className={`h-4 w-4 shrink-0 text-[#7A666D] transition-transform duration-300 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-[#2E0B17]">{draft.title}</p>
                        <p className="text-xs text-[#7A666D]">
                          {draft.channel} ·{" "}
                          <span className="font-medium text-[#4D1627]">
                            Creator &gt; Reviewer &gt; Approved
                          </span>{" "}
                          (Current: <strong>{draft.stage}</strong>)
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#5E4B51]">{draft.findingsCount} findings</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColor}`}>
                        {draft.risk} risk
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenDraft(draft.id)}
                        className="rounded-lg border border-[#D9CEB8] px-3 py-1.5 text-xs font-semibold text-[#2E0B17] transition hover:bg-[#FAF6EE] active:scale-95"
                      >
                        Open →
                      </button>
                    </div>
                  </div>

                  {/* Pure CSS Smooth Accordion */}
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="ml-7 mt-3 rounded-xl border border-[#EFE8D8] bg-[#FAF6EE] p-3 text-xs">
                        {draft.topFinding ? (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              <strong className="text-rose-800">Top flag:</strong>{" "}
                              {draft.topFinding.label} —{" "}
                              <span className="text-[#5E4B51]">{draft.topFinding.source}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpenDraft(draft.id)}
                              className="font-semibold text-[#4D1627] underline"
                            >
                              Review &amp; decide →
                            </button>
                          </div>
                        ) : (
                          <span className="text-emerald-800">
                            No blocking issues detected. Ready for human sign-off.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}