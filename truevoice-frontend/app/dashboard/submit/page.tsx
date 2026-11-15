"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useSession } from "@/lib/SessionContext";

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

type CreateDraftResponse = {
  id?: string;
  draft_id?: string;
  status?: string;
  risk_level?: string;
  findings_count?: number;
  findings?: Finding[];
};

const EXAMPLE =
  "Our serum is clinically proven to remove wrinkles in 3 days. Launching Friday 20 Nov with flat 30% off!";

const CHECK_STEPS = [
  "1. Cleaning text & splitting claims",
  "2. Running exact-match rules (prices, dates)",
  "3. Checking claims against approved library",
];

const CHANNELS = ["Instagram", "Email", "Display Ads", "Sales"];

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
  const { user } = useSession();
  const canReportMistake = user?.role === "reviewer" || user?.role === "admin";

  const [draftTitle, setDraftTitle] = useState("");
  const [channel, setChannel] = useState("Instagram");
  const [text, setText] = useState("");
  const [checkedText, setCheckedText] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Save draft & handover state (POST /drafts, POST /drafts/:id/handover)
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [openWhyId, setOpenWhyId] = useState<string | null>(null);
  const [whyNotes, setWhyNotes] = useState<Record<string, string>>({});
  const [handingId, setHandingId] = useState<string | null>(null);
  const [handedIds, setHandedIds] = useState<Record<string, boolean>>({});

  // Report AI Mistake state (POST /api/ai-mistakes)
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [mistakeForm, setMistakeForm] = useState({
    phrase: "",
    region: "India",
    user_correction: "",
  });
  const [mistakeSavingId, setMistakeSavingId] = useState<string | null>(null);
  const [mistakeStatus, setMistakeStatus] = useState<Record<string, string>>({});

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
    setSavedDraftId(null);
    setHandedIds({});
    setOpenReportId(null);
    setMistakeStatus({});
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
    setDraftTitle("");
    setText("");
    setCheckedText("");
    setResult(null);
    setSavedDraftId(null);
    setError(null);
    setNotice(null);
    setOpenWhyId(null);
    setOpenReportId(null);
    setHandedIds({});
    setMistakeStatus({});
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const ok = /\.(txt|md)$/i.test(file.name) || file.type.startsWith("text/");
    if (!ok) {
      setError("Only .txt and .md files are supported in this round. Images and PDFs come later.");
      return;
    }

    const content = await file.text();
    if (!draftTitle.trim()) setDraftTitle(file.name);
    setText(content);
    setResult(null);
    setSavedDraftId(null);
    setError(null);
    setNotice(`Loaded "${file.name}". Click Check draft to scan it.`);
  }

  async function submitDraftToQueue(): Promise<{ id: string; findings: Finding[] } | null> {
    if (!result) return null;
    if (savedDraftId) {
      return { id: savedDraftId, findings: result.findings ?? [] };
    }
    setSubmittingDraft(true);
    setError(null);
    try {
      const fallbackTitle = `Draft (${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })})`;
      const res = await api<CreateDraftResponse>("/drafts", {
        method: "POST",
        body: {
          title: draftTitle.trim() || fallbackTitle,
          channel,
          text,
          findings: result.findings ?? [],
          risk_level: result.risk_level ?? "LOW",
        },
      });
      const id = res.id ?? res.draft_id;
      if (!id) throw new Error("Backend did not return a draft ID.");
      const dbFindings = Array.isArray(res.findings) ? res.findings : result.findings ?? [];
      setSavedDraftId(id);
      if (Array.isArray(res.findings)) {
        setResult((prev) => (prev ? { ...prev, findings: res.findings } : prev));
      }
      setNotice("✓ Draft submitted to Review Queue!");
      return { id, findings: dbFindings };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit draft to review queue.");
      return null;
    } finally {
      setSubmittingDraft(false);
    }
  }

  async function handleHandover(f: Finding, idx: number) {
    setHandingId(f.id);
    setError(null);
    try {
      const saved = await submitDraftToQueue();
      if (!saved) return;

      const matchedFinding =
        saved.findings.find(
          (sf) => sf.id === f.id || (f.flagged_text && sf.flagged_text === f.flagged_text)
        ) ?? saved.findings[idx];

      await api(`/drafts/${saved.id}/handover`, {
        method: "POST",
        body: {
          finding_id: matchedFinding?.id ?? f.id,
          explanation: (whyNotes[f.id] ?? "").trim(),
        },
      });
      setHandedIds((prev) => ({ ...prev, [f.id]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not hand finding to manager.");
    } finally {
      setHandingId(null);
    }
  }

  function toggleReportDrawer(f: Finding) {
    if (openReportId === f.id) {
      setOpenReportId(null);
      return;
    }
    setOpenReportId(f.id);
    setMistakeForm({
      phrase: (f.flagged_text || f.reason || "").trim().slice(0, 120),
      region: "India",
      user_correction: "",
    });
  }

  async function submitAiMistake(f: Finding) {
    const phrase = mistakeForm.phrase.trim().slice(0, 120);
    const region = mistakeForm.region.trim().slice(0, 60);
    const incorrectFlag = (f.reason || f.type || "").trim().slice(0, 200);
    const userCorrection = mistakeForm.user_correction.trim().slice(0, 300);

    if (!phrase || !userCorrection) {
      setMistakeStatus((prev) => ({
        ...prev,
        [f.id]: "Please fill in both the phrase and your correction.",
      }));
      return;
    }

    setMistakeSavingId(f.id);
    try {
      const res = await api<{ mistake?: { updated_existing?: boolean } }>("/ai-mistakes", {
        method: "POST",
        body: {
          phrase,
          region,
          incorrect_flag: incorrectFlag,
          user_correction: userCorrection,
          flagged_text: phrase,
          team_region: region,
          reason: incorrectFlag,
          correction: userCorrection,
        },
      });
      const updated = res?.mistake?.updated_existing;
      setMistakeStatus((prev) => ({
        ...prev,
        [f.id]: updated
          ? "✓ Updated your earlier correction for this phrase."
          : "✓ Saved! Future AI checks will learn from this example.",
      }));
      setOpenReportId(null);
    } catch (err) {
      setMistakeStatus((prev) => ({
        ...prev,
        [f.id]: err instanceof Error ? err.message : "Could not save correction.",
      }));
    } finally {
      setMistakeSavingId(null);
    }
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
    setSavedDraftId(null);
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
        <h1 className="text-2xl font-semibold sm:text-4xl">Submit draft</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--tv-muted)] sm:text-base">
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

      {/* Title, Channel & Draft Input */}
      <div className="animate-pop-in space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="draft-title" className="text-sm font-medium">
              Draft title
            </label>
            <input
              id="draft-title"
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="e.g. Winter Serum Launch Post"
              className="mt-1.5 w-full rounded-xl border border-[var(--tv-edge)] bg-white px-3.5 py-2 text-sm outline-none focus:border-[var(--tv-brand)]"
            />
          </div>
          <div>
            <label htmlFor="draft-channel" className="text-sm font-medium">
              Channel
            </label>
            <select
              id="draft-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[var(--tv-edge)] bg-white px-3.5 py-2 text-sm outline-none focus:border-[var(--tv-brand)]"
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
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
              className="block w-full bg-transparent p-3.5 text-sm outline-none sm:p-4 sm:text-base"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3">
          <button
            type="button"
            onClick={handleCheck}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--tv-brand)] px-6 py-2.5 font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--tv-brand-ink)] active:scale-95 disabled:opacity-60 sm:w-auto"
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            <span>{loading ? "Checking draft…" : "Check draft"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!draftTitle.trim()) setDraftTitle("Winter Serum Launch");
              setText(EXAMPLE);
              setSavedDraftId(null);
              setNotice(null);
            }}
            className="w-full rounded-xl border border-[var(--tv-edge)] bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--tv-paper)] active:scale-95 sm:w-auto"
          >
            Use example draft
          </button>
          <label className="w-full cursor-pointer rounded-xl border border-[var(--tv-edge)] bg-white px-4 py-2.5 text-center text-sm font-medium transition hover:bg-[var(--tv-paper)] active:scale-95 sm:w-auto">
            Attach .txt / .md
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
          <button
            type="button"
            onClick={handleClear}
            className="w-full rounded-xl border border-[var(--tv-edge)] px-4 py-2.5 text-sm font-medium transition hover:bg-white active:scale-95 sm:w-auto"
          >
            Clear
          </button>
        </div>
        <p className="text-xs text-[var(--tv-muted)]">
          Supported formats: pasted text, <code>.txt</code>, and <code>.md</code>. Image, logo, and
          PDF checks are planned for a later stage.
        </p>
      </div>

      {error && (
        <p role="alert" className="animate-pop-in font-medium text-[var(--tv-flag)]">
          {error}
        </p>
      )}

      {notice && (
        <div
          role="status"
          className="animate-pop-in flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1f6b3a]/30 bg-[#ddebdd]/50 p-3 text-sm font-medium text-[#1f6b3a]"
        >
          <span>&#10003; {notice}</span>
          {savedDraftId && (
            <Link href="/dashboard/review" className="font-semibold underline">
              Open in Review queue &rarr;
            </Link>
          )}
        </div>
      )}

      {result && (
        <section className="space-y-6 pt-2" aria-label="Check results">
          {/* Overall Risk Summary + Submit for Human Review */}
          <div
            role="status"
            className="animate-pop-in flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[var(--tv-champagne)] bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                  Overall risk
                </p>
                <span
                  className={`mt-1 inline-flex items-center gap-2 rounded-full px-4 py-1 text-base font-semibold sm:text-lg ${
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

            <div className="flex w-full items-center gap-3 sm:w-auto">
              <span className="hidden text-xs text-[var(--tv-muted)] sm:inline">
                &#10022; Human decides
              </span>
              <button
                type="button"
                disabled={submittingDraft || Boolean(savedDraftId) || outOfDate}
                onClick={submitDraftToQueue}
                className="w-full rounded-xl bg-[var(--tv-brand)] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] active:scale-95 disabled:opacity-60 sm:w-auto sm:py-2"
              >
                {savedDraftId
                  ? "✓ Submitted to Queue"
                  : submittingDraft
                    ? "Submitting…"
                    : "Submit for human review"}
              </button>
            </div>
          </div>

          {outOfDate && (
            <p className="animate-pop-in rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-[#7a4b00]">
              Your draft has changed since this check. Run <strong>Check draft</strong> again for
              fresh results before submitting.
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

                return (
                  <li
                    key={f.id}
                    style={{ animationDelay: `${idx * 90}ms` }}
                    className="animate-pop-in rounded-2xl border border-[var(--tv-line)] bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5"
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

                      {canReportMistake && (
                        <button
                          type="button"
                          onClick={() => toggleReportDrawer(f)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                            openReportId === f.id || mistakeStatus[f.id]?.startsWith("✓")
                              ? "border-[var(--tv-brand)] bg-[var(--tv-paper)] text-[var(--tv-brand)]"
                              : "border-[var(--tv-line)] text-[var(--tv-muted)] hover:bg-[var(--tv-paper)]"
                          }`}
                        >
                          {mistakeStatus[f.id]?.startsWith("✓")
                            ? "✓ AI mistake reported"
                            : "⚑ Report AI Mistake"}
                        </button>
                      )}
                    </div>

                    {mistakeStatus[f.id] && (
                      <p
                        role="status"
                        className={`animate-pop-in mt-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
                          mistakeStatus[f.id].startsWith("✓")
                            ? "bg-[#ddebdd] text-[#1f6b3a]"
                            : "bg-[#f9ddd9] text-[#9b1c13]"
                        }`}
                      >
                        {mistakeStatus[f.id]}
                      </p>
                    )}

                    {/* Report AI Mistake Inline Drawer (Reviewer/Admin) */}
                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                        openReportId === f.id
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="mt-3 space-y-2.5 rounded-xl border border-[var(--tv-champagne)] bg-[var(--tv-paper)] p-3.5 text-xs">
                          <p className="font-semibold text-[var(--tv-ink)]">
                            Correct the AI for future checks (saved as an example, no retraining):
                          </p>
                          <p className="text-[11px] text-[var(--tv-muted)]">
                            Note: Only affects AI &amp; regional-nuance checks. Exact company rules
                            (like expired offers or prices) stay enforced.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="sm:col-span-2">
                              <label className="block font-medium text-[var(--tv-muted)]">
                                Phrase (required, max 120)
                              </label>
                              <input
                                type="text"
                                maxLength={120}
                                value={mistakeForm.phrase}
                                onChange={(e) =>
                                  setMistakeForm((p) => ({ ...p, phrase: e.target.value }))
                                }
                                className="mt-1 w-full rounded-lg border border-[var(--tv-line)] bg-white px-2.5 py-1.5 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block font-medium text-[var(--tv-muted)]">
                                Region (max 60)
                              </label>
                              <input
                                type="text"
                                maxLength={60}
                                value={mistakeForm.region}
                                onChange={(e) =>
                                  setMistakeForm((p) => ({ ...p, region: e.target.value }))
                                }
                                className="mt-1 w-full rounded-lg border border-[var(--tv-line)] bg-white px-2.5 py-1.5 text-xs"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block font-medium text-[var(--tv-muted)]">
                              Your correction / why it&rsquo;s okay (required, max 300)
                            </label>
                            <textarea
                              rows={2}
                              maxLength={300}
                              value={mistakeForm.user_correction}
                              onChange={(e) =>
                                setMistakeForm((p) => ({
                                  ...p,
                                  user_correction: e.target.value,
                                }))
                              }
                              placeholder="e.g. Acceptable regional slang / benign campaign phrasing."
                              className="mt-1 w-full rounded-lg border border-[var(--tv-line)] bg-white p-2 text-xs"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={mistakeSavingId === f.id}
                              onClick={() => submitAiMistake(f)}
                              className="w-full rounded-lg bg-[var(--tv-brand)] px-3 py-1.5 font-semibold text-white hover:bg-[var(--tv-brand-ink)] disabled:opacity-60 sm:w-auto"
                            >
                              {mistakeSavingId === f.id ? "Saving…" : "Save correction"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenReportId(null)}
                              className="w-full rounded-lg border border-[var(--tv-line)] bg-white px-3 py-1.5 sm:w-auto"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {f.flagged_text && (
                      <p className="mt-3 break-words text-sm">
                        Flagged wording:{" "}
                        <mark className="rounded bg-[#f9ddd9] px-1.5 py-0.5 font-medium text-[#9b1c13]">
                          {f.flagged_text}
                        </mark>
                      </p>
                    )}

                    <p className="mt-2 text-sm">{f.reason}</p>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--tv-paper)] px-3.5 py-2.5 text-xs text-[var(--tv-muted)]">
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
                        <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
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
                      <div className="mt-4 flex flex-col items-stretch gap-3 rounded-xl border border-[#1f6b3a]/20 bg-[#ddebdd]/40 p-3 sm:flex-row sm:items-center">
                        <p className="min-w-0 flex-1 break-words text-sm">
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
                            className="w-full shrink-0 rounded-lg bg-[var(--tv-brand)] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] active:scale-95 sm:w-auto sm:py-1.5"
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
                                disabled={handingId === f.id}
                                onClick={() => handleHandover(f, idx)}
                                className="mt-2 w-full rounded-lg bg-[#7a4b00] px-3 py-1.5 font-semibold text-white transition hover:bg-[#5e3a00] active:scale-95 disabled:opacity-60 sm:w-auto"
                              >
                                {handingId === f.id ? "Sending to manager…" : "Hand to Manager"}
                              </button>
                            </>
                          ) : (
                            <p className="font-semibold text-[#1f6b3a]">
                              &#10003; Handed to human manager and saved to Review Queue.
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