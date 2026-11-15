"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ProofOfApprovalBadge } from "@/components/ProofOfApprovalBadge";

type Draft = {
  id: string;
  title?: string;
  channel?: string | null;
  status?: string;
  risk_level?: string;
  content?: string;
  text?: string;
  total_findings?: number;
  high_severity_findings?: number;
  handover_to_manager?: number;
};

type DraftFinding = {
  id: string;
  severity?: string;
  flagged_text?: string;
  reason?: string;
  rule_ref?: string;
  source_id?: string;
  creator_explanation?: string | null;
};

type HistoryItem = {
  id?: string;
  action?: string;
  actor_name?: string;
  actor?: string;
  details?: string;
  note?: string;
  timestamp?: string;
  created_at?: string;
};

type DraftDetail = {
  draft: Draft;
  findings?: DraftFinding[];
  history?: HistoryItem[];
  approval_badge?: {
    badge_code?: string;
    approved_by?: string;
    reviewer_name?: string;
    approved_at?: string;
    approved_content?: string;
    snapshot_content?: string;
  } | null;
};

type DecisionResponse = {
  badge?: {
    badge_code?: string;
    approved_by?: string;
    reviewer_name?: string;
    approved_at?: string;
    approved_content?: string;
    snapshot_content?: string;
  };
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

function stageIndex(
  status = "",
  hasBadge = false,
  history: HistoryItem[] = []
): number {
  const s = status.toLowerCase();

  if (s.includes("approv") || hasBadge) return 2;

  const hasApprovedHistory = history.some((h) =>
    (h.action ?? "").toLowerCase().includes("approv")
  );
  if (hasApprovedHistory && !s.includes("chang")) return 2;

  if (
    s.includes("review") ||
    s.includes("submit") ||
    s.includes("pending") ||
    s.includes("chang") ||
    history.some((h) => (h.action ?? "").toLowerCase().includes("chang"))
  ) {
    return 1;
  }

  return 0;
}

export default function ReviewPage() {
  const detailRef = useRef<HTMLElement | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DraftDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);

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
  const activeDraftId = selected?.id ?? null;
  const filterIdx = FILTERS.findIndex((f) => f.key === filter);

  // Load full draft content, findings, history & existing badge on selection
  useEffect(() => {
    if (!activeDraftId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDecisionMsg(null);
    api<DraftDetail>(`/drafts/${activeDraftId}`)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDraftId]);

  async function recordDecision(action: "approved" | "changes_requested") {
    if (!selected) return;
    setSubmitting(true);
    setDecisionMsg(null);
    try {
      const res = await api<DecisionResponse>(`/drafts/${selected.id}/decision`, {
        method: "POST",
        body: { action, note: comment.trim() },
      });
      setComment("");
      setDrafts((prev) =>
        prev
          ? prev.map((d) => (d.id === selected.id ? { ...d, status: action } : d))
          : prev
      );
      const refreshed = await api<DraftDetail>(`/drafts/${selected.id}`);
      if (res?.badge?.badge_code && !refreshed.approval_badge) {
        refreshed.approval_badge = res.badge;
      }
      if (refreshed.draft) {
        refreshed.draft = { ...refreshed.draft, status: action };
      }
      setDetail(refreshed);
      setDecisionMsg(
        action === "approved"
          ? "✓ Draft approved and Proof-of-Approval badge generated."
          : "Changes requested and saved to history."
      );
    } catch (err) {
      setDecisionMsg(err instanceof Error ? err.message : "Could not record decision.");
    } finally {
      setSubmitting(false);
    }
  }

  const activeDraft = detail?.draft ?? selected;
  const badge = detail?.approval_badge;
  const activeStage = stageIndex(
    activeDraft?.status,
    Boolean(badge?.badge_code),
    detail?.history ?? []
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="animate-pop-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-4xl">Review queue</h1>
          <p className="mt-1 text-sm text-[var(--tv-muted)] sm:text-base">
            Drafts waiting for a human decision, sorted riskiest first.
          </p>
        </div>

        <div className="relative grid w-full grid-cols-4 rounded-full border border-[var(--tv-line)] bg-white p-1 shadow-xs sm:w-auto">
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
                className={`relative z-10 min-w-0 rounded-full px-2 py-1 text-xs font-semibold transition-colors sm:min-w-[74px] sm:px-3 ${
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
        <div className="rounded-2xl border border-dashed border-[var(--tv-edge)] bg-white p-6 text-sm">
          No drafts match this filter.{" "}
          <Link href="/dashboard/submit" className="font-semibold text-[var(--tv-brand)] underline">
            Check a new draft
          </Link>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-5">
          <ul className="space-y-3 lg:col-span-2">
            {filtered.map((d, idx) => {
              const risk = (d.risk_level ?? "").toUpperCase();
              const isSelected = selected?.id === d.id;
              return (
                <li key={d.id} style={{ animationDelay: `${idx * 70}ms` }} className="animate-pop-in">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(d.id);
                      if (window.innerWidth < 1024) {
                        requestAnimationFrame(() =>
                          detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                        );
                      }
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition-all duration-200 ${
                      isSelected
                        ? "border-[var(--tv-brand)] bg-white shadow-md ring-2 ring-[var(--tv-brand)]/15 lg:translate-x-1"
                        : "border-[var(--tv-line)] bg-white/80 hover:bg-white hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words font-semibold text-[var(--tv-ink)]">
                        {d.title ?? d.id}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          riskStyle[risk] ?? "bg-[var(--tv-paper)]"
                        }`}
                      >
                        {risk || "UNKNOWN"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--tv-muted)]">
                      {d.channel ?? "No channel"} &middot; {d.total_findings ?? 0} findings
                      {d.handover_to_manager === 1 && " · With manager"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          {activeDraft && (
            <section
              ref={detailRef}
              key={activeDraft.id}
              className="animate-pop-in scroll-mt-4 space-y-5 rounded-2xl border-2 border-[var(--tv-champagne)] bg-white p-4 shadow-sm sm:p-6 lg:col-span-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                    {activeDraft.channel ?? "Draft"}
                  </span>
                  <h2 className="mt-1 break-words text-xl font-semibold sm:text-2xl">
                    {activeDraft.title ?? activeDraft.id}
                  </h2>
                </div>
                {badge?.badge_code && (
                  <span className="rounded-lg border-2 border-[#1f6b3a] bg-[#ddebdd] px-3 py-1 text-xs font-bold text-[#1f6b3a]">
                    APPROVED &middot; {badge.badge_code}
                  </span>
                )}
              </div>

              {/* Workflow Bar */}
              <div className="rounded-xl bg-[var(--tv-paper)] p-3.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  {(["Creator", "Reviewer", "Approved"] as const).map((step, i) => (
                    <span
                      key={step}
                      className={i <= activeStage ? "text-[var(--tv-brand)]" : "text-[var(--tv-muted)]"}
                    >
                      {step}
                    </span>
                  ))}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-[var(--tv-brand)] transition-all duration-500 ease-out"
                    style={{ width: `${((activeStage + 1) / 3) * 100}%` }}
                  />
                </div>
              </div>

              {detailLoading ? (
                <p className="text-xs text-[var(--tv-muted)]">Loading draft content &amp; findings…</p>
              ) : (
                <>
                  {/* Full Draft Content */}
                  {(activeDraft.content || activeDraft.text) && (
                    <div className="rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/60 p-4 text-sm">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--tv-muted)]">
                        Draft content
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        {activeDraft.content ?? activeDraft.text}
                      </p>
                    </div>
                  )}

                  {/* Findings List */}
                  {detail?.findings && detail.findings.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tv-muted)]">
                        Findings ({detail.findings.length})
                      </p>
                      {detail.findings.map((f) => (
                        <div key={f.id} className="rounded-xl border border-[var(--tv-line)] p-3 text-xs">
                          <span className="font-bold text-[var(--tv-flag)]">
                            {f.severity ?? "FLAG"}
                          </span>{" "}
                          {f.flagged_text && <strong>&ldquo;{f.flagged_text}&rdquo;</strong>}
                          <p className="mt-1 text-[var(--tv-ink)]">{f.reason}</p>
                          {(f.rule_ref || f.source_id) && (
                            <p className="mt-1 text-[var(--tv-muted)]">
                              {f.rule_ref} {f.source_id ? `· Source ${f.source_id}` : ""}
                            </p>
                          )}
                          {f.creator_explanation && (
                            <p className="mt-2 rounded-lg bg-[#f6e7c8]/60 px-2.5 py-1.5 text-[#7a4b00]">
                              <strong>Creator context:</strong> {f.creator_explanation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reviewer Notes & Decision History */}
                  {detail?.history && detail.history.length > 0 && (
                    <div className="rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tv-muted)]">
                        Reviewer notes &amp; decision history
                      </p>
                      <ul className="mt-2.5 space-y-2">
                        {detail.history.map((h, i) => {
                          const action = (h.action ?? "").toUpperCase();
                          const actor = h.actor_name ?? h.actor ?? "Team member";
                          const text = h.details ?? h.note ?? "";
                          const when = h.timestamp ?? h.created_at;
                          const isChangeReq = action === "CHANGES_REQUESTED";
                          const isApproved = action === "APPROVED";

                          return (
                            <li
                              key={h.id ?? `${action}-${i}`}
                              className={`rounded-lg border px-3 py-2 text-xs ${
                                isChangeReq
                                  ? "border-[#9b1c13]/30 bg-[#f9ddd9]/50 text-[#9b1c13]"
                                  : isApproved
                                    ? "border-[#1f6b3a]/30 bg-[#ddebdd]/50 text-[#1f6b3a]"
                                    : "border-[var(--tv-line)] bg-white text-[var(--tv-ink)]"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                                <span>
                                  {action.replace(/_/g, " ")} &middot; {actor}
                                </span>
                                {when && (
                                  <span className="font-normal opacity-75">
                                    {new Date(when).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              {text && <p className="mt-1 whitespace-pre-wrap">{text}</p>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {/* Reviewer Decision Controls */}
              <div>
                <label htmlFor="review-note" className="text-xs font-semibold text-[var(--tv-muted)]">
                  Reviewer note / dismissal reason
                </label>
                <textarea
                  id="review-note"
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional approval note, or reason for requesting changes..."
                  className="mt-1.5 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 p-3 text-sm outline-none focus:border-[var(--tv-brand)]"
                />
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => recordDecision("approved")}
                  className="w-full rounded-xl bg-[#1f6b3a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#17522c] disabled:opacity-60 sm:w-auto sm:py-2"
                >
                  &#10003; Approve draft
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => recordDecision("changes_requested")}
                  className="w-full rounded-xl border border-[var(--tv-brand)] px-4 py-2.5 text-sm font-semibold text-[var(--tv-brand)] transition hover:bg-[var(--tv-paper)] disabled:opacity-60 sm:w-auto sm:py-2"
                >
                  Request changes
                </button>
              </div>

              {decisionMsg && (
                <p role="status" className="rounded-xl bg-[var(--tv-paper)] p-3 text-xs font-medium">
                  {decisionMsg}
                </p>
              )}

              {/* Real Proof-of-Approval Badge from res.badge.badge_code */}
              {badge?.badge_code && (
                <ProofOfApprovalBadge
                  badgeCode={badge.badge_code}
                  title={activeDraft.title ?? activeDraft.id}
                  approvedBy={badge.reviewer_name ?? badge.approved_by ?? "Reviewer"}
                  approvedAt={badge.approved_at ?? "Just now"}
                  approvedContent={
                    badge.approved_content ??
                    badge.snapshot_content ??
                    activeDraft.content ??
                    activeDraft.text ??
                    ""
                  }
                />
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}