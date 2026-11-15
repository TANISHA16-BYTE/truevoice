"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useSession } from "@/lib/SessionContext";
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
  status?: string;
  dismiss_reason?: string | null;
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
  const { user } = useSession();
  const isCreator = user.role.toLowerCase() === "creator";

  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DraftDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);
  const [openDismissId, setOpenDismissId] = useState<string | null>(null);
  const [dismissReasons, setDismissReasons] = useState<Record<string, string>>({});
  const [dismissErrors, setDismissErrors] = useState<Record<string, string>>({});
  const [dismissingId, setDismissingId] = useState<string | null>(null);

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
    setOpenDismissId(null);
    setDismissErrors({});
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

  async function dismissFinding(findingId: string) {
    if (!selected) return;
    const reason = (dismissReasons[findingId] || comment).trim();
    if (!reason) {
      setDismissErrors((prev) => ({
        ...prev,
        [findingId]: "Please type a reason in the box above first.",
      }));
      return;
    }
    setDismissingId(findingId);
    setDismissErrors((prev) => ({ ...prev, [findingId]: "" }));
    setDecisionMsg(null);
    try {
      await api(`/drafts/${selected.id}/findings/${findingId}/dismiss`, {
        method: "POST",
        body: { reason },
      });
      setOpenDismissId(null);
      setDismissReasons((prev) => ({ ...prev, [findingId]: "" }));
      const refreshed = await api<DraftDetail>(`/drafts/${selected.id}`);
      setDetail(refreshed);
      setDecisionMsg("✓ Finding dismissed with reason recorded (Health Score updated).");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not dismiss finding.";
      setDismissErrors((prev) => ({ ...prev, [findingId]: msg }));
      setDecisionMsg(msg);
    } finally {
      setDismissingId(null);
    }
  }

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

      {isCreator && (
        <div
          role="alert"
          className="rounded-xl border border-[#9b1c13]/30 bg-[#f9ddd9]/60 px-4 py-3 text-xs font-medium text-[#9b1c13]"
        >
          You are logged in as a <strong>Creator</strong> ({user.email}). Log out and sign in as a{" "}
          <strong>Reviewer</strong> (<code>riddhi@glowvale.demo</code> / <code>reviewer123</code>) to
          dismiss findings, approve drafts, or request changes.
        </div>
      )}

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
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
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
              key={activeDraft.id}
              className="animate-pop-in space-y-5 rounded-2xl border-2 border-[var(--tv-champagne)] bg-white p-6 shadow-sm lg:col-span-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                    {activeDraft.channel ?? "Draft"}
                  </span>
                  <h2 className="mt-1 text-2xl font-semibold">
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
                      <p className="whitespace-pre-wrap">{activeDraft.content ?? activeDraft.text}</p>
                    </div>
                  )}

                  {/* Findings List */}
                  {detail?.findings && detail.findings.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tv-muted)]">
                        Findings ({detail.findings.length})
                      </p>
                      {detail.findings.map((f) => {
                        const isDismissed = (f.status ?? "").toLowerCase() === "dismissed";
                        const isOpen = openDismissId === f.id;
                        const errText = dismissErrors[f.id];
                        return (
                          <div
                            key={f.id}
                            className={`rounded-xl border p-3 text-xs ${
                              isDismissed
                                ? "border-[#1f6b3a]/30 bg-[#ddebdd]/25"
                                : "border-[var(--tv-line)]"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <span
                                  className={`font-bold ${
                                    isDismissed ? "text-[#1f6b3a]" : "text-[var(--tv-flag)]"
                                  }`}
                                >
                                  {isDismissed ? "DISMISSED" : f.severity ?? "FLAG"}
                                </span>{" "}
                                {f.flagged_text && <strong>&ldquo;{f.flagged_text}&rdquo;</strong>}
                              </div>

                              {!isDismissed && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenDismissId(isOpen ? null : f.id);
                                    setDismissErrors((prev) => ({ ...prev, [f.id]: "" }));
                                  }}
                                  className="rounded-lg border border-[var(--tv-line)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--tv-ink)] transition hover:bg-[var(--tv-paper)]"
                                >
                                  {isOpen ? "Cancel" : "Dismiss"}
                                </button>
                              )}
                            </div>

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
                            {isDismissed && f.dismiss_reason && (
                              <p className="mt-2 rounded-lg bg-[#ddebdd]/60 px-2.5 py-1.5 text-[#1f6b3a]">
                                <strong>Dismissal reason:</strong> {f.dismiss_reason}
                              </p>
                            )}

                            {isOpen && !isDismissed && (
                              <div className="mt-2.5 space-y-2 rounded-lg bg-[var(--tv-paper)] p-2.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="text"
                                    value={dismissReasons[f.id] ?? ""}
                                    onChange={(e) =>
                                      setDismissReasons((prev) => ({
                                        ...prev,
                                        [f.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Why is this finding okay? (e.g. Approved campaign exception)"
                                    className="min-w-[200px] flex-1 rounded-lg border border-[var(--tv-line)] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[var(--tv-brand)]"
                                  />
                                  <button
                                    type="button"
                                    disabled={dismissingId === f.id}
                                    onClick={() => dismissFinding(f.id)}
                                    className="rounded-lg bg-[var(--tv-brand)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] disabled:opacity-60"
                                  >
                                    {dismissingId === f.id ? "Dismissing…" : "Confirm dismiss"}
                                  </button>
                                </div>
                                {errText && (
                                  <p role="alert" className="font-semibold text-[#9b1c13]">
                                    {errText}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
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

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => recordDecision("approved")}
                  className="rounded-xl bg-[#1f6b3a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#17522c] disabled:opacity-60"
                >
                  &#10003; Approve draft
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => recordDecision("changes_requested")}
                  className="rounded-xl border border-[var(--tv-brand)] px-4 py-2 text-sm font-semibold text-[var(--tv-brand)] transition hover:bg-[var(--tv-paper)] disabled:opacity-60"
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