"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type RuleMetric = {
  id?: string;
  rule_ref: string;
  title?: string;
  section?: string;
  current_wording?: string;
  total_flagged: number;
  override_count?: number;
  override_rate_pct: number;
  is_unclear: boolean;
  suggested_action: string;
};

type HealthResponse = {
  health_score: number;
  status: string;
  problematic_rules_count?: number;
  most_flagged_rules: RuleMetric[];
  unclear_rules_alert: RuleMetric[];
};

export default function GuidelineHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [barsReady, setBarsReady] = useState(false);
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [draftWording, setDraftWording] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    api<HealthResponse>("/analytics/guideline-health")
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setTimeout(() => setBarsReady(true), 80);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load Guideline Health Score.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveClearerWording(rule: RuleMetric) {
    const nextText = draftWording.trim();
    if (!nextText) return;
    setSaving(true);
    const targetId = rule.id ?? rule.rule_ref;
    try {
      await api(`/library/${encodeURIComponent(targetId)}`, {
        method: "PATCH",
        body: { text: nextText },
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              unclear_rules_alert: prev.unclear_rules_alert.map((r) =>
                r.rule_ref === rule.rule_ref ? { ...r, current_wording: nextText } : r
              ),
            }
          : prev
      );
      setSavedMsg((prev) => ({ ...prev, [rule.rule_ref]: "✓ Rule wording updated in library." }));
      setEditingRef(null);
    } catch (err) {
      setSavedMsg((prev) => ({
        ...prev,
        [rule.rule_ref]: err instanceof Error ? err.message : "Could not update rule.",
      }));
    } finally {
      setSaving(false);
    }
  }

  const rules = data?.most_flagged_rules ?? [];
  const alerts = data?.unclear_rules_alert ?? [];
  const maxFlags = Math.max(...rules.map((r) => r.total_flagged), 1);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="animate-pop-in flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Guideline Health Score</h1>
          <p className="mt-2 text-[var(--tv-muted)]">
            Live analytics from review findings and overrides. Unclear rules are flagged so your
            team can fix the root cause.
          </p>
        </div>

        {data && (
          <div className="flex items-center gap-4 rounded-2xl border-2 border-[var(--tv-champagne)] bg-white px-5 py-3 shadow-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                Overall Score
              </p>
              <p className="font-serif text-3xl font-bold text-[var(--tv-brand)]">
                {data.health_score}
                <span className="text-base font-normal text-[var(--tv-muted)]">/100</span>
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                data.status === "HEALTHY"
                  ? "bg-[#ddebdd] text-[#1f6b3a]"
                  : "bg-[#f6e7c8] text-[#7a4b00]"
              }`}
            >
              {data.status}
            </span>
          </div>
        )}
      </div>

      {!data && !error && <p className="text-[var(--tv-muted)]">Loading health score…</p>}
      {error && (
        <p role="alert" className="font-medium text-[var(--tv-flag)]">
          {error}
        </p>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="animate-pop-in rounded-2xl border border-[var(--tv-line)] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Most-flagged rules</h2>
            <ul className="mt-5 space-y-4">
              {rules.map((r) => {
                const pct = Math.round((r.total_flagged / maxFlags) * 100);
                return (
                  <li key={r.rule_ref}>
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="font-semibold text-[var(--tv-ink)]">
                        {r.rule_ref}
                        {r.title ? ` · ${r.title}` : ""}
                      </span>
                      <span className="tabular-nums text-xs text-[var(--tv-muted)]">
                        {r.total_flagged} flags &middot; {r.override_rate_pct}% overridden
                      </span>
                    </div>
                    <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-[var(--tv-paper)]">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${
                          r.is_unclear ? "bg-[#c98000]" : "bg-[var(--tv-brand)]"
                        }`}
                        style={{ width: barsReady ? `${pct}%` : "0%" }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="animate-pop-in rounded-2xl border-2 border-[var(--tv-champagne)] bg-[#fbf7f0] p-6 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Needs clearer wording</h2>
              <span className="rounded-full bg-[#f6e7c8] px-3 py-0.5 text-xs font-semibold text-[#7a4b00]">
                {data.problematic_rules_count ?? alerts.length} unclear
              </span>
            </div>

            {alerts.length === 0 ? (
              <p className="mt-4 rounded-xl bg-white p-4 text-sm text-[#1f6b3a]">
                &#10003; All guidelines currently have low override rates.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {alerts.map((r) => {
                  const isEditing = editingRef === r.rule_ref;
                  return (
                    <div
                      key={r.rule_ref}
                      className="rounded-xl border border-[var(--tv-line)] bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">
                          {r.rule_ref}
                          {r.title ? `: ${r.title}` : ""}
                        </span>
                        <span className="rounded-full bg-[#f6e7c8] px-2.5 py-0.5 text-xs font-semibold text-[#7a4b00]">
                          Overridden {r.override_rate_pct}%
                        </span>
                      </div>

                      {r.current_wording && (
                        <p className="mt-2 text-xs text-[var(--tv-muted)]">
                          <strong>Current rule:</strong> {r.current_wording}
                        </p>
                      )}
                      <p className="mt-2 text-xs">{r.suggested_action}</p>

                      {savedMsg[r.rule_ref] && (
                        <p className="mt-2 rounded-lg bg-[#ddebdd] px-3 py-1.5 text-xs font-medium text-[#1f6b3a]">
                          {savedMsg[r.rule_ref]}
                        </p>
                      )}

                      {isEditing ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            rows={3}
                            value={draftWording}
                            onChange={(e) => setDraftWording(e.target.value)}
                            className="w-full rounded-lg border border-[var(--tv-brand)] p-2 text-xs"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => saveClearerWording(r)}
                              className="rounded-lg bg-[var(--tv-brand)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--tv-brand-ink)] disabled:opacity-60"
                            >
                              {saving ? "Saving…" : "Save to library"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRef(null)}
                              className="rounded-lg border border-[var(--tv-line)] px-3 py-1.5 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRef(r.rule_ref);
                            setDraftWording(r.current_wording ?? "");
                          }}
                          className="mt-3 rounded-lg bg-[var(--tv-brand)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)]"
                        >
                          Draft clearer wording
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}