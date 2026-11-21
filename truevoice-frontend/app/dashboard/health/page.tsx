"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  Check,
  Edit3,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/SessionContext";

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

const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const;

function useCountUp(target: number, enabled: boolean, duration = 900): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (target <= 0) {
      setValue(0);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled, duration]);

  return value;
}

export default function GuidelineHealthPage() {
  const { user } = useSession();
  const isAdmin = (user?.role ?? "").toLowerCase() === "admin";
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    if (!isAdmin) return;
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
  const score = data?.health_score ?? 0;
  const animatedScore = useCountUp(score, data !== null);
  const scoreRatio = Math.min(Math.max(score, 0), 100) / 100;
  const isInsufficient = data?.status === "INSUFFICIENT_DATA";
  const unclearCount = data?.problematic_rules_count ?? alerts.length;
  const hasElevatedOverrides = rules.some((r) => r.override_rate_pct >= 30);

  return (
    <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
      {/* Hero Burgundy Diagnostic Banner + Animated Radial Gauge */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EDITORIAL_EASE }}
        className="tv-surface relative overflow-hidden rounded-3xl border border-[var(--tv-brand-ink)] bg-[var(--tv-brand)] p-6 text-[#FAF6EE] sm:p-8"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-[#EFE5CE]/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 left-1/4 h-44 w-56 rounded-full bg-[#d9bc98]/10 blur-3xl"
        />

        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EFE5CE]/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#EFE5CE]">
              <Activity className="h-3.5 w-3.5" />
              Live Guideline Analytics
            </span>

            <h1 className="mt-3 text-2xl font-semibold text-[#FAF6EE] sm:text-4xl">
              Guideline Health Score
            </h1>
            <p className="mt-2 text-sm text-[#EFE5CE]/85 sm:text-base">
              Live analytics from review findings and overrides. Unclear rules are flagged so your
              team can fix the root cause.
            </p>

            {data && (
              <div className="mt-4 flex flex-wrap items-center gap-2.5 text-xs">
                <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 font-medium text-[#FAF6EE]">
                  {rules.length} {rules.length === 1 ? "rule" : "rules"} tracked
                </span>
                <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 font-medium text-[#FAF6EE]">
                  {unclearCount} needing clearer wording
                </span>
                {isInsufficient && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f6e7c8] px-3 py-1 font-semibold text-[#7a4b00]">
                    <Sparkles className="h-3 w-3" />
                    Provisional · Needs more review history
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Animated Semi-Circular Radial Gauge */}
          {data && (
            <div className="flex w-full flex-col items-center rounded-2xl border border-white/15 bg-black/20 px-6 py-4 backdrop-blur-xs md:w-auto">
              <div className="relative h-32 w-52">
                <svg viewBox="0 0 200 116" className="h-full w-full overflow-visible" aria-hidden="true">
                  {/* Track Arc (dashed if insufficient data) */}
                  <path
                    d="M 20 100 A 80 80 0 0 1 180 100"
                    fill="none"
                    stroke="rgba(239, 229, 206, 0.22)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={isInsufficient ? "6 6" : undefined}
                  />
                  {/* Animated Progress Arc */}
                  <motion.path
                    d="M 20 100 A 80 80 0 0 1 180 100"
                    fill="none"
                    stroke={
                      data.status === "HEALTHY"
                        ? "#86efac"
                        : isInsufficient
                          ? "#EFE5CE"
                          : "#f6e7c8"
                    }
                    strokeWidth="12"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: scoreRatio }}
                    transition={{ duration: 1.05, ease: EDITORIAL_EASE }}
                  />
                </svg>

                <div className="absolute inset-x-0 bottom-1 flex flex-col items-center text-center">
                  <div className="flex items-baseline gap-0.5">
                    <span className="font-serif text-4xl font-bold leading-none tabular-nums text-[#FAF6EE]">
                      {animatedScore}
                    </span>
                    <span className="text-sm text-[#EFE5CE]/75">/100</span>
                  </div>
                  <span
                    className={`mt-2 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${
                      data.status === "HEALTHY"
                        ? "bg-[#ddebdd] text-[#1f6b3a]"
                        : "bg-[#f6e7c8] text-[#7a4b00]"
                    }`}
                  >
                    {data.status}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.section>

      {!data && !error && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl border border-[var(--tv-line)] bg-white/80" />
          <div className="h-72 animate-pulse rounded-2xl border border-[var(--tv-champagne)] bg-white/80" />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-[#f2c4be] bg-[#f9ddd9]/55 px-4 py-3 text-sm font-medium text-[var(--tv-flag)]"
        >
          {error}
        </p>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Card 1: Most-Flagged Rules with Dual-Tone Stacked Bars */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: EDITORIAL_EASE }}
            className="tv-surface rounded-3xl border border-[var(--tv-line)] bg-white p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold sm:text-xl">Most-flagged rules</h2>
              <div className="flex items-center gap-3 text-[11px] font-medium text-[var(--tv-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--tv-brand)]" />
                  Flags
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#d9bc98]" />
                  Overridden %
                </span>
              </div>
            </div>

            {rules.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-[var(--tv-line)] p-4 text-sm text-[var(--tv-muted)]">
                No rule flags recorded yet.
              </p>
            ) : (
              <ul className="mt-5 space-y-3.5">
                {rules.map((r, idx) => {
                  const pct = Math.round((r.total_flagged / maxFlags) * 100);
                  const overrideWidth = Math.min(Math.max(r.override_rate_pct, 0), 100);

                  return (
                    <li
                      key={r.rule_ref}
                      className="rounded-2xl border border-transparent p-2.5 transition-colors hover:border-[var(--tv-line)] hover:bg-[#fbf7f0]"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 break-words font-semibold text-[var(--tv-ink)]">
                          {r.rule_ref}
                          {r.title ? ` · ${r.title}` : ""}
                        </span>
                        <span className="tabular-nums text-xs text-[var(--tv-muted)]">
                          <strong className="text-[var(--tv-ink)]">{r.total_flagged}</strong> flags
                          &middot; {r.override_rate_pct}% overridden
                        </span>
                      </div>

                      {/* Dual-Tone Animated Bar */}
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-[var(--tv-paper)]">
                        <motion.div
                          initial={{ width: "0%" }}
                          animate={{ width: `${pct}%` }}
                          transition={{
                            duration: 0.8,
                            delay: 0.12 + idx * 0.06,
                            ease: EDITORIAL_EASE,
                          }}
                          className={`relative h-full overflow-hidden rounded-full ${
                            r.is_unclear ? "bg-[#c98000]" : "bg-[var(--tv-brand)]"
                          }`}
                        >
                          {overrideWidth > 0 && (
                            <motion.div
                              initial={{ width: "0%" }}
                              animate={{ width: `${overrideWidth}%` }}
                              transition={{
                                duration: 0.7,
                                delay: 0.35 + idx * 0.06,
                                ease: EDITORIAL_EASE,
                              }}
                              title={`${r.override_rate_pct}% overridden`}
                              className="absolute inset-y-0 right-0 rounded-r-full bg-[#d9bc98]"
                            />
                          )}
                        </motion.div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.section>

          {/* Card 2: Needs Clearer Wording */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.14, ease: EDITORIAL_EASE }}
            className="tv-surface flex flex-col rounded-3xl border-2 border-[var(--tv-champagne)] bg-gradient-to-br from-[#fbf7f0] to-[#f4ead9] p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold sm:text-xl">Needs clearer wording</h2>
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                  unclearCount === 0
                    ? "bg-[#ddebdd] text-[#1f6b3a]"
                    : "bg-[#f6e7c8] text-[#7a4b00]"
                }`}
              >
                {unclearCount} unclear
              </span>
            </div>

            {alerts.length === 0 ? (
              <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-2xl border border-[#b9d9c2]/70 bg-white/90 px-6 py-10 text-center shadow-xs">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 20, delay: 0.2 }}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#b9d9c2] bg-[#eef7f0] text-[#1f6b3a]"
                >
                  <ShieldCheck className="h-7 w-7" />
                </motion.div>
                <p className="mt-4 font-serif text-lg font-semibold text-[var(--tv-ink)]">
                  {isInsufficient || hasElevatedOverrides || score < 90
                    ? "Monitoring early override signals"
                    : "All guidelines are crystal clear"}
                </p>
                <p className="mt-1 max-w-xs text-xs text-[var(--tv-muted)]">
                  {hasElevatedOverrides
                    ? "Some rules (like those with 30%+ overrides) are being watched, but need more review samples before triggering a formal rewrite alert."
                    : isInsufficient
                      ? "More reviewed drafts are needed before rules can be marked as unclear or fully healthy."
                      : "All guidelines currently have low override rates across reviewed drafts."}
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {alerts.map((r) => {
                  const isEditing = editingRef === r.rule_ref;
                  return (
                    <div
                      key={r.rule_ref}
                      className="rounded-2xl border border-[var(--tv-champagne)] bg-white p-4 shadow-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex min-w-0 items-center gap-1.5 break-words font-semibold text-[var(--tv-ink)]">
                          <AlertCircle className="h-4 w-4 shrink-0 text-[#c98000]" />
                          {r.rule_ref}
                          {r.title ? `: ${r.title}` : ""}
                        </span>
                        <span className="rounded-full bg-[#f6e7c8] px-2.5 py-0.5 text-xs font-semibold text-[#7a4b00]">
                          Overridden {r.override_rate_pct}%
                        </span>
                      </div>

                      {r.current_wording && (
                        <p className="mt-2 break-words rounded-lg bg-[var(--tv-paper)]/70 px-3 py-2 text-xs text-[var(--tv-muted)]">
                          <strong className="text-[var(--tv-ink)]">Current rule:</strong>{" "}
                          {r.current_wording}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-[var(--tv-ink)]">{r.suggested_action}</p>

                      <AnimatePresence>
                        {savedMsg[r.rule_ref] && (
                          <motion.p
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#ddebdd] px-3 py-1.5 text-xs font-medium text-[#1f6b3a]"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {savedMsg[r.rule_ref]}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      {isAdmin ? (
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div
                              key="editor"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.22, ease: EDITORIAL_EASE }}
                              className="mt-3 space-y-2 overflow-hidden"
                            >
                              <textarea
                                rows={3}
                                value={draftWording}
                                onChange={(e) => setDraftWording(e.target.value)}
                                className="w-full rounded-xl border border-[var(--tv-brand)] bg-[#fcf9f3] p-2.5 text-xs outline-none"
                              />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => saveClearerWording(r)}
                                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--tv-brand)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--tv-brand-ink)] disabled:opacity-60 sm:w-auto"
                                >
                                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                  <span>{saving ? "Saving…" : "Save to library"}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRef(null)}
                                  className="w-full rounded-lg border border-[var(--tv-line)] bg-white px-3 py-1.5 text-xs sm:w-auto"
                                >
                                  Cancel
                                </button>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.button
                              key="btn"
                              type="button"
                              whileTap={{ scale: 0.97 }}
                              onClick={() => {
                                setEditingRef(r.rule_ref);
                                setDraftWording(r.current_wording ?? "");
                              }}
                              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--tv-brand)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] sm:w-auto"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Draft clearer wording</span>
                            </motion.button>
                          )}
                        </AnimatePresence>
                      ) : (
                        <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--tv-line)] bg-[var(--tv-paper)]/70 px-2.5 py-1 text-[11px] font-medium text-[var(--tv-muted)]">
                          <Lock className="h-3 w-3 text-[var(--tv-brand)]" />
                          Admin only: sign in as an Admin to rewrite guideline rules.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.section>
        </div>
      )}
    </div>
  );
}