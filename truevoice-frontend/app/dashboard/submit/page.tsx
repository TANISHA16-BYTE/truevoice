"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Finding = {
  id: string;
  type?: string;
  severity?: string;
  flagged_text?: string;
  rule_ref?: string | null;
  source_id?: string | null;
  reason?: string;
  suggested_fix?: string | null;
  confidence?: number | null;
};

type CheckResult = {
  risk_level?: string;
  findings_count?: number;
  findings?: Finding[];
  summary?: {
    high_severity_count?: number;
    medium_severity_count?: number;
    low_severity_count?: number;
    unverified_count?: number;
  };
};

const EXAMPLE =
  "Our serum is clinically proven to remove wrinkles in 3 days. Launching Friday 20 Nov with flat 30% off!";

const CHECK_STEPS = [
  "1. Cleaning text & splitting claims",
  "2. Running exact-match rules (prices, dates)",
  "3. Checking claims against approved library",
];

const severityStyle: Record<string, string> = {
  HIGH: "bg-[#f9ddd9] text-[#9b1c13]",
  MEDIUM: "bg-[#f6e7c8] text-[#7a4b00]",
  LOW: "bg-[#ddebdd] text-[#1f6b3a]",
};

const severityBarColor: Record<string, string> = {
  HIGH: "bg-[#9b1c13]",
  MEDIUM: "bg-[#c98000]",
  LOW: "bg-[#1f6b3a]",
};

const severityLabel: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const severityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function typeLabel(type = ""): string {
  if (/unverified/i.test(type)) return "Unverified, needs source";
  const words = type.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Finding";
}

function needsPerson(type = ""): boolean {
  return /clash|schedule/i.test(type);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function SubmitPage() {
  const [text, setText] = useState("");
  const [checkedText, setCheckedText] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openWhyId, setOpenWhyId] = useState<string | null>(null);
  const [whyNotes, setWhyNotes] = useState<Record<string, string>>({});
  const [handedIds, setHandedIds] = useState<Record<string, boolean>>({});
  const [reportedIds, setReportedIds] = useState<Record<string, boolean>>({});

  // Advance the 3-step pipeline animation while /check is running.
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, 2));
    }, 450);
    return () => clearInterval(timer);
  }, [loading]);

  async function handleCheck() {
    if (!text.trim()) {
      setError("Paste or type a draft first.");
      return;
    }
    setError(null);
    setNotice(null);
    setActiveStep(0);
    setLoading(true);
    try {
      const data = await api<CheckResult>("/check", { method: "POST", body: { text } });
      setResult(data);
      setCheckedText(text);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setText("");
    setCheckedText("");
    setResult(null);
    setError(null);
    setNotice(null);
    setOpenWhyId(null);
  }

  function applyFix(finding: Finding) {
    const flagged = finding.flagged_text;
    const fix = finding.suggested_fix;
    if (!flagged || !fix) return;

    const loose = flagged
      .trim()
      .split(/\s+/)
      .map((word) => escapeRegExp(word.replace(/s$/i, "")) + "s?")
      .join("\\s+");
    const match = new RegExp(loose, "i").exec(text);
    if (!match) {
      setNotice(`Couldn't find "${flagged}" in your draft. Please edit it by hand.`);
      return;
    }

    let start = match.index;
    const firstWord = fix.split(/\s+/)[0];
    const doubled = text
      .slice(0, start)
      .match(new RegExp(escapeRegExp(firstWord) + "\\s+$", "i"));
    if (doubled) start -= doubled[0].length;

    setText(text.slice(0, start) + fix + text.slice(match.index + match[0].length));
    setNotice(
      "Your draft was updated with the suggested fix. Read the sentence and run Check draft again."
    );
  }

  const findings = [...(result?.findings ?? [])].sort(
    (a, b) => (severityRank[a.severity ?? ""] ?? 3) - (severityRank[b.severity ?? ""] ?? 3)
  );
  const risk = (result?.risk_level ?? "").toUpperCase();
  const outOfDate = result !== null && text !== checkedText;
  const pipelineStep = loading ? activeStep : result ? 3 : -1;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="animate-pop-in">
        <h1 className="text-4xl font-semibold">Submit draft</h1>
        <p className="mt-2 max-w-2xl text-[var(--tv-muted)]">
          Paste a draft to see what needs fixing before a reviewer looks at it. TrueVoice checks it
          against the approved library, shows the source for every finding, and leaves the decision
          to a person.
        </p>
      </div>

      {/* Live 3-Step Check Radar */}
      <div className="animate-pop-in grid gap-2 rounded-2xl border border-[var(--tv-line)] bg-white p-3 shadow-xs sm:grid-cols-3">
        {CHECK_STEPS.map((label, idx) => {
          const done = pipelineStep > idx;
          const current = pipelineStep === idx;
          return (
            <div
              key={label}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-300 ${
                done
                  ? "bg-[#ddebdd] text-[#1f6b3a]"
                  : current
                    ? "bg-[var(--tv-brand)] text-white shadow-sm"
                    : "bg-[var(--tv-paper)] text-[var(--tv-muted)]"
              }`}
            >
              {done ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1f6b3a] text-[10px] text-white">
                  &#10003;
                </span>
              ) : (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  {current && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--tv-champagne)] opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                      current ? "bg-[var(--tv-champagne)]" : "bg-[var(--tv-edge)]/40"
                    }`}
                  />
                </span>
              )}
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Draft Input with Sweeping Scanner Beam */}
      <div className="animate-pop-in">
        <label htmlFor="draft" className="font-medium">
          Your draft
        </label>
        <div className="relative mt-2 overflow-hidden rounded-xl border border-[var(--tv-edge)] bg-white shadow-xs transition focus-within:border-[var(--tv-brand)] focus-within:ring-2 focus-within:ring-[var(--tv-brand)]/15">
          {loading && (
            <div
              aria-hidden="true"
              className="animate-scan-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[var(--tv-champagne)]/45 to-transparent"
            />
          )}
          <textarea
            id="draft"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your post, ad copy, or email draft here..."
            className="block w-full bg-transparent p-4 text-base outline-none"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCheck}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--tv-brand)] px-6 py-2.5 font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--tv-brand-ink)] active:scale-95 disabled:opacity-60"
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            <span>{loading ? "Checking draft…" : "Check draft"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setText(EXAMPLE);
              setNotice(null);
            }}
            className="rounded-xl border border-[var(--tv-edge)] bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--tv-paper)] active:scale-95"
          >
            Use example draft
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl border border-[var(--tv-edge)] px-4 py-2.5 text-sm font-medium transition hover:bg-white active:scale-95"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="animate-pop-in text-[var(--tv-flag)] font-medium">
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="animate-pop-in rounded-xl border border-[#1f6b3a]/30 bg-[#ddebdd]/50 p-3 text-sm font-medium text-[#1f6b3a]"
        >
          &#10003; {notice}
        </p>
      )}

      {result && (
        <section className="space-y-6 pt-2" aria-label="Check results">
          {/* Overall Risk Summary */}
          <div
            role="status"
            className="animate-pop-in flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[var(--tv-champagne)] bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                  Overall risk
                </p>
                <span
                  className={`mt-1 inline-flex items-center gap-2 rounded-full px-4 py-1 text-lg font-semibold ${
                    severityStyle[risk] ?? "bg-[var(--tv-paper)]"
                  }`}
                >
                  {risk === "HIGH" && (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#9b1c13] opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#9b1c13]" />
                    </span>
                  )}
                  {severityLabel[risk] ?? (risk || "Unknown")}
                </span>
              </div>
              <div className="text-sm">
                <p className="font-semibold">
                  {result.findings_count ?? findings.length}{" "}
                  {(result.findings_count ?? findings.length) === 1 ? "finding" : "findings"}
                </p>
                {result.summary && (
                  <p className="text-[var(--tv-muted)]">
                    {result.summary.high_severity_count ?? 0} high,{" "}
                    {result.summary.medium_severity_count ?? 0} medium,{" "}
                    {result.summary.low_severity_count ?? 0} low
                    {(result.summary.unverified_count ?? 0) > 0 &&
                      `, ${result.summary.unverified_count} unverified`}
                  </p>
                )}
              </div>
            </div>
            <span className="text-xs text-[var(--tv-muted)]">&#10022; Human decides</span>
          </div>

          {outOfDate && (
            <p className="animate-pop-in rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-[#7a4b00]">
              Your draft has changed since this check. Run <strong>Check draft</strong> again for
              fresh results.
            </p>
          )}

          {findings.length === 0 ? (
            <p className="animate-pop-in rounded-xl border border-dashed border-[var(--tv-edge)] bg-white p-5">
              No findings. Nothing in the approved library conflicts with this draft. A person still
              makes the final decision.
            </p>
          ) : (
            <ol className="space-y-4">
              {findings.map((f, idx) => {
                const sev = (f.severity ?? "").toUpperCase();
                const confidence =
                  typeof f.confidence === "number"
                    ? Math.round(f.confidence <= 1 ? f.confidence * 100 : f.confidence)
                    : null;
                const whyOpen = openWhyId === f.id;
                const handed = Boolean(handedIds[f.id]);
                const reported = Boolean(reportedIds[f.id]);

                return (
                  <li
                    key={f.id}
                    style={{ animationDelay: `${idx * 90}ms` }}
                    className="animate-pop-in rounded-2xl border border-[var(--tv-line)] bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                            severityStyle[sev] ?? "bg-[var(--tv-paper)]"
                          }`}
                        >
                          {severityLabel[sev] ?? "Finding"}
                        </span>
                        <span className="font-semibold">{typeLabel(f.type)}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setReportedIds((prev) => ({ ...prev, [f.id]: !prev[f.id] }))
                        }
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                          reported
                            ? "border-[var(--tv-brand)] bg-[var(--tv-paper)] text-[var(--tv-brand)]"
                            : "border-[var(--tv-line)] text-[var(--tv-muted)] hover:bg-[var(--tv-paper)]"
                        }`}
                      >
                        {reported ? "✓ AI mistake noted" : "⚑ Report AI Mistake"}
                      </button>
                    </div>

                    {f.flagged_text && (
                      <p className="mt-3 text-sm">
                        Flagged wording:{" "}
                        <mark className="rounded bg-[#f9ddd9] px-1.5 py-0.5 font-medium text-[#9b1c13]">
                          {f.flagged_text}
                        </mark>
                      </p>
                    )}

                    <p className="mt-2 text-sm">{f.reason}</p>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[var(--tv-paper)] px-3.5 py-2.5 text-xs text-[var(--tv-muted)]">
                      <span>
                        {f.rule_ref && <>Rule {f.rule_ref}</>}
                        {f.rule_ref && f.source_id && <> &middot; </>}
                        {f.source_id ? (
                          <strong className="text-[var(--tv-ink)]">Source {f.source_id}</strong>
                        ) : (
                          <strong className="text-[#7a4b00]">Unverified, needs source</strong>
                        )}
                      </span>

                      {confidence !== null && (
                        <div className="flex items-center gap-2">
                          <span>Confidence {confidence}%</span>
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white">
                            <div
                              className={`animate-bar-grow h-full rounded-full ${
                                severityBarColor[sev] ?? "bg-[var(--tv-brand)]"
                              }`}
                              style={{ width: `${confidence}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {f.suggested_fix && (
                      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#1f6b3a]/20 bg-[#ddebdd]/40 p-3">
                        <p className="flex-1 text-sm">
                          <span className="font-semibold text-[#1f6b3a]">Suggested fix:</span>{" "}
                          {f.suggested_fix}
                        </p>
                        {needsPerson(f.type) ? (
                          <span className="text-xs font-semibold text-[#7a4b00]">
                            Needs a person: check the schedule
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => applyFix(f)}
                            className="rounded-lg bg-[var(--tv-brand)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] active:scale-95"
                          >
                            Use this fix
                          </button>
                        )}
                      </div>
                    )}

                    {/* One-Chance "Why flagged?" -> Hand to Manager */}
                    <div className="mt-3 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setOpenWhyId(whyOpen ? null : f.id)}
                        className="text-xs font-semibold text-[var(--tv-brand)] underline"
                      >
                        {whyOpen ? "Hide context" : "Why flagged? (1-chance context)"}
                      </button>
                    </div>

                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                        whyOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="mt-2 rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)] p-3 text-xs">
                          {!handed ? (
                            <>
                              <p className="font-semibold text-[var(--tv-ink)]">
                                Give one quick explanation (e.g. a campaign pun), or pass to a
                                human manager:
                              </p>
                              <textarea
                                rows={2}
                                value={whyNotes[f.id] ?? ""}
                                onChange={(e) =>
                                  setWhyNotes((prev) => ({ ...prev, [f.id]: e.target.value }))
                                }
                                placeholder="Add context for your reviewer..."
                                className="mt-2 w-full rounded-lg border border-[var(--tv-line)] bg-white p-2 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setHandedIds((prev) => ({ ...prev, [f.id]: true }))
                                }
                                className="mt-2 rounded-lg bg-[#7a4b00] px-3 py-1.5 font-semibold text-white transition hover:bg-[#5e3a00] active:scale-95"
                              >
                                Hand to Manager
                              </button>
                            </>
                          ) : (
                            <p className="font-semibold text-[#1f6b3a]">
                              &#10003; Queued for human manager decision. No endless bot debate.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <p className="text-sm text-[var(--tv-muted)]">
            TrueVoice only checks against the approved library. No finding does not mean a draft is
            correct, and nothing is published without a person&rsquo;s decision.
          </p>
        </section>
      )}
    </div>
  );
}