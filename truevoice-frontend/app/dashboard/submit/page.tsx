"use client";

import { useState } from "react";
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

const severityStyle: Record<string, string> = {
  HIGH: "bg-[#f9ddd9] text-[#9b1c13]",
  MEDIUM: "bg-[#f6e7c8] text-[#7a4b00]",
  LOW: "bg-[#ddebdd] text-[#1f6b3a]",
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

// Some findings can't be fixed by editing the draft text (for example a
// schedule clash). They need a person to decide.
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleCheck() {
    if (!text.trim()) {
      setError("Paste or type a draft first.");
      return;
    }
    setError(null);
    setNotice(null);
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
  }

  // Replaces the flagged wording with the suggested fix. The writer sees the change.
  function applyFix(finding: Finding) {
    const flagged = finding.flagged_text;
    const fix = finding.suggested_fix;
    if (!flagged || !fix) return;

    // Match the flagged wording loosely: ignore capitals and a trailing "s"
    // (so "removes wrinkles" also finds "remove wrinkles").
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

    // Avoid doubled words, like "flat Flat 20% off".
    let start = match.index;
    const firstWord = fix.split(/\s+/)[0];
    const doubled = text
      .slice(0, start)
      .match(new RegExp(escapeRegExp(firstWord) + "\\s+$", "i"));
    if (doubled) start -= doubled[0].length;

    setText(text.slice(0, start) + fix + text.slice(match.index + match[0].length));
    setNotice(
      "Your draft was updated with the suggested fix. Read the sentence and tidy the wording, then run Check draft again."
    );
  }

  const findings = [...(result?.findings ?? [])].sort(
    (a, b) => (severityRank[a.severity ?? ""] ?? 3) - (severityRank[b.severity ?? ""] ?? 3)
  );
  const risk = (result?.risk_level ?? "").toUpperCase();
  const outOfDate = result !== null && text !== checkedText;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-4xl font-semibold">Submit draft</h1>
      <p className="mt-2 max-w-2xl text-[var(--tv-muted)]">
        Paste a draft to see what needs fixing before a reviewer looks at it. TrueVoice checks it
        against the approved library, shows the source for every finding, and leaves the decision
        to a person.
      </p>

      <div className="mt-8">
        <label htmlFor="draft" className="font-medium">
          Your draft
        </label>
        <textarea
          id="draft"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-2 block w-full rounded-xl border border-[var(--tv-edge)] bg-white p-4 text-base"
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCheck}
            disabled={loading}
            className="rounded-md bg-[var(--tv-brand)] px-6 py-2.5 font-medium text-white hover:bg-[var(--tv-brand-ink)] disabled:opacity-60"
          >
            {loading ? "Checking…" : "Check draft"}
          </button>
          <button
            type="button"
            onClick={() => {
              setText(EXAMPLE);
              setNotice(null);
            }}
            className="rounded-md border border-[var(--tv-edge)] px-4 py-2.5 hover:bg-white"
          >
            Use example draft
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md border border-[var(--tv-edge)] px-4 py-2.5 hover:bg-white"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 text-[var(--tv-flag)]">
          {error}
        </p>
      )}

      {notice && (
        <p role="status" className="mt-6 rounded-md bg-white p-3 text-sm">
          {notice}
        </p>
      )}

      {result && (
        <section className="mt-10" aria-label="Check results">
          <div
            role="status"
            className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-[var(--tv-champagne)] bg-white p-5"
          >
            <div>
              <p className="text-sm text-[var(--tv-muted)]">Overall risk</p>
              <span
                className={`mt-1 inline-block rounded-full px-4 py-1 text-lg font-semibold ${
                  severityStyle[risk] ?? "bg-[var(--tv-paper)]"
                }`}
              >
                {severityLabel[risk] ?? (risk || "Unknown")}
              </span>
            </div>
            <div className="text-sm">
              <p className="font-medium">
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

          {outOfDate && (
            <p className="mt-4 text-sm font-medium text-[#7a4b00]">
              Your draft has changed since this check. Run Check draft again for fresh results.
            </p>
          )}

          {findings.length === 0 ? (
            <p className="mt-6 rounded-md border border-dashed border-[var(--tv-edge)] p-4">
              No findings. Nothing in the approved library conflicts with this draft. A person still
              makes the final decision.
            </p>
          ) : (
            <ol className="mt-6 space-y-4">
              {findings.map((f) => {
                const sev = (f.severity ?? "").toUpperCase();
                const confidence =
                  typeof f.confidence === "number"
                    ? Math.round(f.confidence <= 1 ? f.confidence * 100 : f.confidence)
                    : null;
                return (
                  <li key={f.id} className="rounded-xl border border-[var(--tv-line)] bg-white p-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-0.5 text-sm font-semibold ${
                          severityStyle[sev] ?? "bg-[var(--tv-paper)]"
                        }`}
                      >
                        {severityLabel[sev] ?? "Finding"}
                      </span>
                      <span className="font-medium">{typeLabel(f.type)}</span>
                    </div>

                    {f.flagged_text && (
                      <p className="mt-3">
                        Flagged wording:{" "}
                        <mark className="rounded bg-[#f9ddd9] px-1.5 py-0.5 text-[#9b1c13]">
                          {f.flagged_text}
                        </mark>
                      </p>
                    )}

                    <p className="mt-2">{f.reason}</p>

                    <p className="mt-2 text-sm text-[var(--tv-muted)]">
                      {f.rule_ref && <>Rule {f.rule_ref}</>}
                      {f.rule_ref && f.source_id && <> &middot; </>}
                      {f.source_id ? <>Source {f.source_id}</> : <>No approved source found</>}
                      {confidence !== null && <> &middot; Confidence {confidence}%</>}
                    </p>

                    {f.suggested_fix && (
                      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--tv-paper)] p-3">
                        <p className="flex-1 text-sm">
                          <span className="font-medium">Suggested fix:</span> {f.suggested_fix}
                        </p>
                        {needsPerson(f.type) ? (
                          <span className="text-sm font-medium text-[#7a4b00]">
                            Needs a person: check the schedule
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => applyFix(f)}
                            className="rounded-md border border-[var(--tv-edge)] bg-white px-3 py-1.5 text-sm hover:bg-[var(--tv-paper)]"
                          >
                            Use this fix
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          <p className="mt-6 text-sm text-[var(--tv-muted)]">
            TrueVoice only checks against the approved library. No finding does not mean a draft is
            correct, and nothing is published without a person&rsquo;s decision.
          </p>
        </section>
      )}
    </div>
  );
}