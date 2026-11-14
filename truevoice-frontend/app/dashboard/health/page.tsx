"use client";

import { useEffect, useState } from "react";

type RuleStat = {
  id: string;
  rule: string;
  flags30d: number;
  overrideRate: number; // percentage 0-100
  currentWording: string;
  suggestedWording: string;
};

// Demo data matching Page 6 Sketch #3 — swap with api("/analytics/guideline-health") when backend is ready.
const DEMO_RULES: RuleStat[] = [
  {
    id: "claims-3-1",
    rule: "Claims 3.1",
    flags30d: 34,
    overrideRate: 18,
    currentWording: "Health or beauty claims require clinical proof.",
    suggestedWording:
      "Cite an approved study ID for any efficacy claim (e.g. 'clinically proven').",
  },
  {
    id: "pricing-2-1",
    rule: "Pricing 2.1",
    flags30d: 26,
    overrideRate: 12,
    currentWording: "Discounts must match active promotions.",
    suggestedWording:
      "Use exact discount % and valid dates from the current Offer Sheet before scheduling.",
  },
  {
    id: "tone-1-3",
    rule: "Tone 1.3",
    flags30d: 21,
    overrideRate: 62,
    currentWording: "Keep brand voice friendly and clear, never exaggerated.",
    suggestedWording:
      "Add 3 on-brand examples + 2 words to avoid so writers know what counts as exaggerated.",
  },
  {
    id: "logo-3-4",
    rule: "Channel Clash 3.4",
    flags30d: 14,
    overrideRate: 44,
    currentWording: "Campaign dates must align across channels.",
    suggestedWording:
      "Verify launch date against scheduled social posts before final submission.",
  },
];

export default function GuidelineHealthPage() {
  const [rules, setRules] = useState<RuleStat[]>(DEMO_RULES);
  const [barsReady, setBarsReady] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBarsReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  const maxFlags = Math.max(...rules.map((r) => r.flags30d), 1);
  const unclearRules = rules.filter((r) => r.overrideRate >= 40);

  function startDrafting(rule: RuleStat) {
    setEditingId(rule.id);
    setDraftText(rule.suggestedWording);
    setSavedId(null);
  }

  function saveClearerWording(id: string) {
    if (!draftText.trim()) return;
    setRules((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, currentWording: draftText.trim(), overrideRate: 15 } : r
      )
    );
    setEditingId(null);
    setSavedId(id);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="animate-pop-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Guideline Health Score</h1>
          <p className="mt-2 text-[var(--tv-muted)]">
            Rules broken or dismissed most often may be unclear. Fix the wording to stop repeat
            mistakes.
          </p>
        </div>
        <span className="rounded-full border border-[var(--tv-line)] bg-white px-3 py-1 text-xs text-[var(--tv-muted)]">
          Demo review metrics (30 days)
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Most-Flagged Rules Animated Bar Chart */}
        <section className="animate-pop-in rounded-2xl border border-[var(--tv-line)] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Most-flagged rules (30 days)</h2>
          <p className="mt-1 text-xs text-[var(--tv-muted)]">
            Tracks where creators run into friction most often.
          </p>

          <ul className="mt-5 space-y-4">
            {rules.map((r) => {
              const pct = Math.round((r.flags30d / maxFlags) * 100);
              return (
                <li key={r.id}>
                  <div className="flex justify-between text-sm font-medium">
                    <span>{r.rule}</span>
                    <span className="tabular-nums text-[var(--tv-muted)]">
                      {r.flags30d} flags &middot; {r.overrideRate}% overridden
                    </span>
                  </div>
                  <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-[var(--tv-paper)]">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${
                        r.overrideRate >= 40 ? "bg-[#c98000]" : "bg-[var(--tv-brand)]"
                      }`}
                      style={{ width: barsReady ? `${pct}%` : "0%" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Unclear Rules + Draft Clearer Wording */}
        <section
          style={{ animationDelay: "90ms" }}
          className="animate-pop-in rounded-2xl border-2 border-[var(--tv-champagne)] bg-[#fbf7f0] p-6 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Needs clearer wording</h2>
            <span className="rounded-full bg-[#f6e7c8] px-3 py-0.5 text-xs font-semibold text-[#7a4b00]">
              {unclearRules.length} rules flagged &amp; overridden
            </span>
          </div>

          <div className="mt-4 space-y-4">
            {rules.map((r) => {
              const isUnclear = r.overrideRate >= 40;
              const isEditing = editingId === r.id;
              if (!isUnclear && savedId !== r.id && !isEditing) return null;

              return (
                <div
                  key={r.id}
                  className="animate-pop-in rounded-xl border border-[var(--tv-line)] bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--tv-ink)]">{r.rule}</span>
                    <span className="text-xs font-semibold text-[#7a4b00]">
                      Overridden {r.overrideRate}% of the time
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-[var(--tv-muted)]">
                    <strong>Current rule:</strong> {r.currentWording}
                  </p>

                  {savedId === r.id && (
                    <p className="animate-pop-in mt-2 rounded bg-[#ddebdd] px-2.5 py-1 text-xs font-semibold text-[#1f6b3a]">
                      &#10003; Updated rule wording saved.
                    </p>
                  )}

                  {isEditing ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        rows={3}
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        className="w-full rounded-lg border border-[var(--tv-brand)] p-2 text-xs"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveClearerWording(r.id)}
                          className="rounded-lg bg-[var(--tv-brand)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--tv-brand-ink)]"
                        >
                          Save clearer wording
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-[var(--tv-line)] px-3 py-1.5 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--tv-paper)] p-2.5 text-xs">
                      <span>
                        <strong>Suggested:</strong> {r.suggestedWording}
                      </span>
                      <button
                        type="button"
                        onClick={() => startDrafting(r)}
                        className="rounded-lg bg-[var(--tv-brand)] px-3 py-1.5 font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] active:scale-95"
                      >
                        Draft clearer wording
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}