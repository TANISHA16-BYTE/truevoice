"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  FileJson,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Lock,
  MessageSquareWarning,
  ShieldAlert,
  Sparkles,
  Pencil,
} from "lucide-react";
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

const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "HIGH", label: "High" },
  { key: "MEDIUM", label: "Medium" },
  { key: "LOW", label: "Low" },
];
type StatusFilterKey = "ALL" | "NEEDS_REVIEW" | "CHANGES_REQUESTED" | "APPROVED";

const STATUS_FILTERS: { key: StatusFilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "NEEDS_REVIEW", label: "Needs review" },
  { key: "CHANGES_REQUESTED", label: "Changes" },
  { key: "APPROVED", label: "Approved" },
];

function getStatusBucket(status = ""): Exclude<StatusFilterKey, "ALL"> {
  const s = status.toLowerCase();
  if (s.includes("approv")) return "APPROVED";
  if (s.includes("chang")) return "CHANGES_REQUESTED";
  return "NEEDS_REVIEW";
}

const statusPillMeta: Record<
  Exclude<StatusFilterKey, "ALL">,
  { label: string; className: string }
> = {
  NEEDS_REVIEW: { label: "Needs review", className: "bg-[#f6e7c8]/70 text-[#7a4b00]" },
  CHANGES_REQUESTED: { label: "Changes", className: "bg-[#f9ddd9] text-[#9b1c13]" },
  APPROVED: { label: "Approved", className: "bg-[#ddebdd] text-[#1f6b3a]" },
};
const riskStyle: Record<string, string> = {
  HIGH: "bg-[#f9ddd9] text-[#9b1c13]",
  MEDIUM: "bg-[#f6e7c8] text-[#7a4b00]",
  LOW: "bg-[#ddebdd] text-[#1f6b3a]",
};

const riskStripe: Record<string, string> = {
  HIGH: "bg-[#9b1c13]",
  MEDIUM: "bg-[#c98000]",
  LOW: "bg-[#1f6b3a]",
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

type TextSegment =
  | { kind: "plain"; text: string }
  | { kind: "match"; text: string; finding: DraftFinding };

function segmentDraftText(content: string, findings: DraftFinding[]): TextSegment[] {
  const candidates = findings
    .filter((f) => Boolean(f.flagged_text?.trim()))
    .map((f) => ({
      finding: f,
      needle: f.flagged_text!.trim(),
    }))
    .sort((a, b) => b.needle.length - a.needle.length);

  if (candidates.length === 0) return [{ kind: "plain", text: content }];

  const lower = content.toLowerCase();
  const ranges: { start: number; end: number; finding: DraftFinding }[] = [];

  for (const { finding, needle } of candidates) {
    const needleLower = needle.toLowerCase();
    let searchFrom = 0;
    while (searchFrom < lower.length) {
      const idx = lower.indexOf(needleLower, searchFrom);
      if (idx === -1) break;
      const end = idx + needle.length;
      const overlaps = ranges.some((r) => !(end <= r.start || idx >= r.end));
      if (!overlaps) {
        ranges.push({ start: idx, end, finding });
        break;
      }
      searchFrom = idx + 1;
    }
  }

  if (ranges.length === 0) return [{ kind: "plain", text: content }];
  ranges.sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) {
      segments.push({ kind: "plain", text: content.slice(cursor, r.start) });
    }
    segments.push({ kind: "match", text: content.slice(r.start, r.end), finding: r.finding });
    cursor = r.end;
  }
  if (cursor < content.length) {
    segments.push({ kind: "plain", text: content.slice(cursor) });
  }
  return segments;
}

export default function ReviewPage() {
  const { token, user } = useSession();
  const isReviewer = ["reviewer", "admin"].includes((user.role ?? "").toLowerCase());
  const isCreator = (user.role ?? "").toLowerCase() === "creator";
  const detailRef = useRef<HTMLElement | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DraftDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decisionMsg, setDecisionMsg] = useState<string | null>(null);
  const [openDismissId, setOpenDismissId] = useState<string | null>(null);
  const [dismissReasons, setDismissReasons] = useState<Record<string, string>>({});
  const [dismissErrors, setDismissErrors] = useState<Record<string, string>>({});
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<"csv" | "json" | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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

          const targetId = new URLSearchParams(window.location.search).get("draftId");
          const matched = targetId ? sorted.find((d) => d.id === targetId) : undefined;
          if (matched) setSelectedId(matched.id);
          else if (sorted.length > 0) setSelectedId(sorted[0].id);
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

   const allDrafts = drafts ?? [];
  const statusCounts: Record<StatusFilterKey, number> = {
    ALL: allDrafts.length,
    NEEDS_REVIEW: allDrafts.filter((d) => getStatusBucket(d.status) === "NEEDS_REVIEW").length,
    CHANGES_REQUESTED: allDrafts.filter((d) => getStatusBucket(d.status) === "CHANGES_REQUESTED").length,
    APPROVED: allDrafts.filter((d) => getStatusBucket(d.status) === "APPROVED").length,
  };

  const filtered = allDrafts.filter((d) => {
    const matchesRisk = filter === "ALL" ? true : (d.risk_level ?? "").toUpperCase() === filter;
    const matchesStatus =
      statusFilter === "ALL" ? true : getStatusBucket(d.status) === statusFilter;
    return matchesRisk && matchesStatus;
  });

  const selected = filtered.find((d) => d.id === selectedId) ?? filtered[0] ?? null;
  const activeDraftId = selected?.id ?? null;

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
    setActiveFindingId(null);
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

  async function recordDecision(action: "approved" | "changes_requested") {
    if (!selected || !isReviewer) return;
    const wasApproved =
      getStatusBucket(selected.status) === "APPROVED" ||
      Boolean(detail?.approval_badge?.badge_code);
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
      if (action === "approved" && res?.badge?.badge_code && !refreshed.approval_badge) {
        refreshed.approval_badge = res.badge;
      }
      if (action === "changes_requested") {
        refreshed.approval_badge = null;
      }
      if (refreshed.draft) {
        refreshed.draft = { ...refreshed.draft, status: action };
      }
      setDetail(refreshed);
      setDecisionMsg(
        action === "approved"
          ? "✓ Draft approved and Proof-of-Approval badge generated."
          : wasApproved
            ? "Approval revoked, old badge invalidated, and changes requested."
            : "Changes requested and saved to history."
      );
    } catch (err) {
      setDecisionMsg(err instanceof Error ? err.message : "Could not record decision.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDismissFinding(findingId: string) {
    if (!selected || !isReviewer) return;
    const reason = (dismissReasons[findingId] || comment || "").trim();
    if (!reason) {
      setDismissErrors((prev) => ({
        ...prev,
        [findingId]: "Please enter a dismissal reason first.",
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
      const refreshed = await api<DraftDetail>(`/drafts/${selected.id}`);
      setDetail(refreshed);
      setOpenDismissId(null);
      setDismissReasons((prev) => ({ ...prev, [findingId]: "" }));
      setDecisionMsg("✓ Finding dismissed with recorded reason. Health analytics updated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not dismiss finding.";
      setDismissErrors((prev) => ({ ...prev, [findingId]: msg }));
      setDecisionMsg(msg);
    } finally {
      setDismissingId(null);
    }
  }

  async function handleAuditExport(format: "csv" | "json") {
    setExportingFormat(format);
    setExportNotice(null);
    setExportError(null);
    try {
      const res = await fetch(`/backend/audit-logs/export?format=${format}`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let msg = `Could not export ${format.toUpperCase()} audit log (error ${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string; message?: string };
          if (data?.error || data?.message) msg = data.error || data.message || msg;
        } catch {
          /* ignore non-JSON error */
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const filename =
        filenameMatch?.[1] || `truevoice_audit_log_${new Date().toISOString().slice(0, 10)}.${format}`;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      setExportNotice(`✓ Downloaded ${filename}`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not export audit log.");
    } finally {
      setExportingFormat(null);
    }
  }

  const activeDraft = detail?.draft ?? selected;
  const badge = detail?.approval_badge;
  const activeStage = stageIndex(
    activeDraft?.status,
    Boolean(badge?.badge_code),
    detail?.history ?? []
  );
  const draftContent = activeDraft?.content ?? activeDraft?.text ?? "";
  const findings = detail?.findings ?? [];
  const annotatedSegments = draftContent ? segmentDraftText(draftContent, findings) : [];
  const activeRisk = (activeDraft?.risk_level ?? "").toUpperCase();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header + Gliding Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EDITORIAL_EASE }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold sm:text-4xl">Review queue</h1>
          <p className="mt-1 text-sm text-[var(--tv-muted)] sm:text-base">
            Drafts waiting for a human decision, sorted riskiest first.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2.5 sm:w-auto">
          {isReviewer && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={exportingFormat !== null}
                onClick={() => handleAuditExport("csv")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--tv-champagne)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--tv-ink)] shadow-xs transition hover:bg-[var(--tv-paper)] disabled:opacity-60"
              >
                {exportingFormat === "csv" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--tv-brand)]" />
                ) : (
                  <FileSpreadsheet className="h-3.5 w-3.5 text-[var(--tv-brand)]" />
                )}
                <span>Export Audit CSV</span>
              </button>
              <button
                type="button"
                disabled={exportingFormat !== null}
                onClick={() => handleAuditExport("json")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--tv-champagne)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--tv-ink)] shadow-xs transition hover:bg-[var(--tv-paper)] disabled:opacity-60"
              >
                {exportingFormat === "json" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--tv-brand)]" />
                ) : (
                  <FileJson className="h-3.5 w-3.5 text-[var(--tv-brand)]" />
                )}
                <span>Export Audit JSON</span>
              </button>
            </div>
          )}

          <div className="grid w-full grid-cols-4 rounded-full border border-[var(--tv-champagne)] bg-white p-1 shadow-xs sm:w-auto">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`relative min-w-0 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors sm:min-w-[76px] sm:px-3 ${
                  active ? "text-white" : "text-[var(--tv-muted)] hover:text-[var(--tv-ink)]"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="review-filter-pill"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="absolute inset-0 rounded-full bg-[var(--tv-brand)] shadow-xs"
                  />
                )}
                <span className="relative z-10">{f.label}</span>
              </button>
            );
          })}
          </div>
        </div>
      </motion.div>

      {(exportNotice || exportError) && (
        <div
          role={exportError ? "alert" : "status"}
          className={`rounded-xl border px-4 py-2.5 text-xs font-medium ${
            exportError
              ? "border-[#9b1c13]/30 bg-[#f9ddd9]/70 text-[#9b1c13]"
              : "border-[#1f6b3a]/30 bg-[#ddebdd]/70 text-[#1f6b3a]"
          }`}
        >
          {exportError || exportNotice}
        </div>
      )}

      {!isReviewer && (
        <div
          role="note"
          className="flex items-center gap-2.5 rounded-xl border border-[#7a4b00]/25 bg-[#f6e7c8]/65 px-4 py-3 text-xs text-[#7a4b00]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            You&apos;re signed in as <strong>{user.role}</strong>. Log in with a{" "}
            <strong>Reviewer</strong> account (e.g. <code>riddhi@glowvale.demo</code>) to dismiss
            findings, approve drafts, or request changes.
          </span>
        </div>
      )}
      {/* Status Filter Bar */}
{drafts !== null && allDrafts.length > 0 && (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div
      role="group"
      aria-label="Filter drafts by status"
      className="flex flex-wrap gap-1.5 rounded-2xl border border-[var(--tv-champagne)] bg-white/90 p-1.5 shadow-xs"
    >
      {STATUS_FILTERS.map((sf) => {
        const active = statusFilter === sf.key;
        return (
          <button
            key={sf.key}
            type="button"
            aria-pressed={active}
            onClick={() => setStatusFilter(sf.key)}
            className={`relative inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              active ? "text-white" : "text-[var(--tv-muted)] hover:text-[var(--tv-ink)]"
            }`}
          >
            {active && (
              <motion.span
                layoutId="review-status-pill"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="absolute inset-0 rounded-xl bg-[var(--tv-brand)] shadow-xs"
              />
            )}
            <span className="relative z-10">{sf.label}</span>
            <span
              className={`relative z-10 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                active
                  ? "bg-white/20 text-white"
                  : "bg-[var(--tv-paper)] text-[var(--tv-ink)]"
              }`}
            >
              {statusCounts[sf.key]}
            </span>
          </button>
        );
      })}
    </div>

    <p className="text-xs text-[var(--tv-muted)]">
      Showing <strong className="text-[var(--tv-ink)]">{filtered.length}</strong> of{" "}
      {allDrafts.length} drafts
    </p>
  </div>
)}
      {drafts === null && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            {[0, 1].map((n) => (
              <div
                key={n}
                className="h-24 animate-pulse rounded-2xl border border-[var(--tv-line)] bg-white/70"
              />
            ))}
          </div>
          <div className="h-96 animate-pulse rounded-3xl border border-[var(--tv-champagne)] bg-white/70 lg:col-span-3" />
        </div>
      )}

      {error && (
        <p role="alert" className="text-[var(--tv-flag)]">
          {error}
        </p>
      )}

      {drafts !== null && filtered.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-[var(--tv-edge)] bg-white/80 p-6 text-sm">
          No drafts match this filter.{" "}
          {(filter !== "ALL" || statusFilter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setFilter("ALL");
                setStatusFilter("ALL");
              }}
              className="mr-3 font-semibold text-[var(--tv-brand)] underline"
            >
              Reset filters
            </button>
          )}
          <Link href="/dashboard/submit" className="font-semibold text-[var(--tv-brand)] underline">
            Check a new draft
          </Link>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid items-start gap-6 lg:grid-cols-5">
          {/* Left Queue Deck */}
          <ul className="space-y-3 lg:col-span-2">
            <AnimatePresence mode="popLayout">
              {filtered.map((d, idx) => {
                const risk = (d.risk_level ?? "").toUpperCase();
                const isSelected = selected?.id === d.id;
                return (
                  <motion.li
                    key={d.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{
                      layout: { duration: 0.28, ease: EDITORIAL_EASE },
                      opacity: { duration: 0.25, delay: idx * 0.04 },
                    }}
                  >
                    <motion.button
                      type="button"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => {
                        setSelectedId(d.id);
                        if (window.innerWidth < 1024) {
                          requestAnimationFrame(() =>
                            detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                          );
                        }
                      }}
                      className={`tv-surface relative w-full overflow-hidden rounded-2xl border p-4 pl-5 text-left transition-all duration-200 ${
                        isSelected
                          ? "border-[var(--tv-brand)] bg-white ring-2 ring-[var(--tv-brand)]/15 lg:translate-x-1"
                          : "border-[var(--tv-line)] bg-white/85 hover:border-[var(--tv-champagne)] hover:bg-white"
                      }`}
                    >
                      {/* Color-coded Risk Accent Stripe */}
                      <span
                        aria-hidden="true"
                        className={`absolute bottom-0 left-0 top-0 w-1.5 ${
                          riskStripe[risk] ?? "bg-[var(--tv-champagne)]"
                        }`}
                      />

                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-words font-semibold text-[var(--tv-ink)]">
                          {d.title ?? d.id}
                        </p>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            riskStyle[risk] ?? "bg-[var(--tv-paper)]"
                          }`}
                        >
                          {risk === "HIGH" && (
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9b1c13]" />
                          )}
                          {risk || "UNKNOWN"}
                        </span>
                      </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--tv-muted)]">
                        <span className="rounded-md bg-[var(--tv-paper)] px-2 py-0.5 font-medium text-[var(--tv-ink)]">
                          {d.channel ?? "No channel"}
                        </span>
                        <span>&middot;</span>
                        <span>{d.total_findings ?? 0} findings</span>
                        {(() => {
                          const meta = statusPillMeta[getStatusBucket(d.status)];
                          return (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                          );
                        })()}
                        {d.handover_to_manager === 1 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                            With manager
                          </span>
                        )}
                      </div>
                    </motion.button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>

          {/* Right High-Contrast Inspector & Spotlight Annotator */}
          {activeDraft && (
            <div className="lg:col-span-3">
              <AnimatePresence mode="wait">
                <motion.section
                  ref={detailRef}
                  key={activeDraft.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: EDITORIAL_EASE }}
                  className="tv-surface scroll-mt-4 overflow-hidden rounded-3xl border-2 border-[var(--tv-champagne)] bg-white"
                >
                  {/* Deep Burgundy Editorial Header + Milestone Stepper */}
                  <div className="relative overflow-hidden bg-[var(--tv-brand)] p-5 text-[#FAF6EE] sm:p-6">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#EFE5CE]/15 blur-2xl"
                    />

                    <div className="relative flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#EFE5CE]/25 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#EFE5CE]">
                            {activeDraft.channel ?? "Draft"}
                          </span>
                          {activeRisk && (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                riskStyle[activeRisk] ?? "bg-white/20 text-white"
                              }`}
                            >
                              {activeRisk} RISK
                            </span>
                          )}
                        </div>
                        <h2 className="mt-2 break-words text-xl font-semibold text-[#FAF6EE] sm:text-2xl">
                          {activeDraft.title ?? activeDraft.id}
                        </h2>
                      </div>

                      {badge?.badge_code && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/40 bg-[#ddebdd] px-3 py-1 text-xs font-bold text-[#1f6b3a] shadow-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          APPROVED &middot; {badge.badge_code}
                        </span>
                      )}
                    </div>

                    {/* Animated Milestone Track */}
                    <div className="relative mt-5 rounded-2xl border border-white/15 bg-black/15 p-3.5">
                      <div className="relative flex items-center justify-between">
                        {/* Track Line */}
                        <div className="absolute left-4 right-4 top-3 h-1 rounded-full bg-white/15" />
                        <motion.div
                          initial={{ width: "0%" }}
                          animate={{ width: `${(activeStage / 2) * 100}%` }}
                          transition={{ duration: 0.5, ease: EDITORIAL_EASE }}
                          className="absolute left-4 top-3 h-1 max-w-[calc(100%-2rem)] rounded-full bg-[#EFE5CE]"
                        />

                        {(["Creator", "Reviewer", "Approved"] as const).map((step, i) => {
                          const completed = i < activeStage;
                          const current = i === activeStage;
                          return (
                            <div key={step} className="relative z-10 flex flex-col items-center gap-1.5">
                              <span
                                className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold transition-all duration-300 ${
                                  completed
                                    ? "border-[#EFE5CE] bg-[#EFE5CE] text-[var(--tv-brand)]"
                                    : current
                                      ? "border-[#EFE5CE] bg-[var(--tv-brand)] text-[#EFE5CE] ring-4 ring-[#EFE5CE]/25"
                                      : "border-white/25 bg-[var(--tv-brand-ink)] text-white/55"
                                }`}
                              >
                                {completed ? <Check className="h-3.5 w-3.5" /> : i + 1}
                              </span>
                              <span
                                className={`text-[11px] font-semibold ${
                                  i <= activeStage ? "text-[#FAF6EE]" : "text-white/55"
                                }`}
                              >
                                {step}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Inspector Body */}
                  <div className="space-y-5 p-5 sm:p-6">
                    {detailLoading ? (
                      <div className="space-y-3">
                        <div className="h-24 animate-pulse rounded-2xl bg-[var(--tv-paper)]" />
                        <div className="h-20 animate-pulse rounded-2xl bg-[var(--tv-paper)]" />
                      </div>
                    ) : (
                      <>
                        {/* Interactive Annotated Draft Content */}
                        {draftContent && (
                          <div className="rounded-2xl border border-[var(--tv-champagne)] bg-gradient-to-br from-[#fbf7f0] to-[#FAF6EE] p-4">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--tv-brand)]">
                                <FileText className="h-3.5 w-3.5" />
                                Draft content
                              </span>
                              {findings.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--tv-muted)]">
                                  <Eye className="h-3 w-3 text-[var(--tv-brand)]" />
                                  Hover a finding or highlight to spotlight
                                </span>
                              )}
                            </div>

                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--tv-ink)] sm:text-[15px]">
                              {annotatedSegments.map((seg, i) => {
                                if (seg.kind === "plain") {
                                  return <span key={i}>{seg.text}</span>;
                                }
                                const f = seg.finding;
                                const sev = (f.severity ?? "").toUpperCase();
                                const isDismissed = (f.status ?? "").toLowerCase() === "dismissed";
                                const isSpotlit = activeFindingId === f.id;
                                const dimmed = activeFindingId !== null && !isSpotlit;

                                const baseHighlight = isDismissed
                                  ? "bg-[#ddebdd]/60 text-[#1f6b3a] line-through decoration-[#1f6b3a]/50"
                                  : sev === "HIGH"
                                    ? "bg-[#f9ddd9] text-[#9b1c13] underline decoration-[#9b1c13]/70 decoration-wavy underline-offset-4"
                                    : sev === "MEDIUM"
                                      ? "bg-[#f6e7c8] text-[#7a4b00] underline decoration-[#c98000]/70 decoration-dotted underline-offset-4"
                                      : "bg-[#ddebdd] text-[#1f6b3a]";

                                return (
                                  <mark
                                    key={`${f.id}-${i}`}
                                    onMouseEnter={() => setActiveFindingId(f.id)}
                                    onMouseLeave={() => setActiveFindingId(null)}
                                    onClick={() =>
                                      setActiveFindingId((curr) => (curr === f.id ? null : f.id))
                                    }
                                    className={`cursor-pointer rounded-md px-1.5 py-0.5 font-medium transition-all duration-200 ${baseHighlight} ${
                                      isSpotlit
                                        ? "ring-2 ring-[var(--tv-brand)] shadow-sm"
                                        : dimmed
                                          ? "opacity-45"
                                          : ""
                                    }`}
                                  >
                                    {seg.text}
                                  </mark>
                                );
                              })}
                            </p>
                          </div>
                        )}

                        {/* Findings List */}
                        {findings.length > 0 && (
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                                <ShieldAlert className="h-3.5 w-3.5 text-[var(--tv-brand)]" />
                                Findings ({findings.length})
                              </p>
                            </div>

                            {findings.map((f) => {
                              const isDismissed = (f.status ?? "").toLowerCase() === "dismissed";
                              const isOpen = openDismissId === f.id;
                              const isSpotlit = activeFindingId === f.id;
                              const errMsg = dismissErrors[f.id];
                              const sev = (f.severity ?? "").toUpperCase();

                              return (
                                <motion.div
                                  key={f.id}
                                  onMouseEnter={() => setActiveFindingId(f.id)}
                                  onMouseLeave={() => setActiveFindingId(null)}
                                  animate={{
                                    scale: isSpotlit ? 1.01 : 1,
                                  }}
                                  transition={{ duration: 0.18 }}
                                  className={`rounded-2xl border p-3.5 text-xs transition-all duration-200 ${
                                    isSpotlit
                                      ? "border-[var(--tv-brand)] bg-[#fbf7f0] shadow-md ring-2 ring-[var(--tv-brand)]/15"
                                      : isDismissed
                                        ? "border-[#b9d9c2] bg-[#f4faf5]/60"
                                        : "border-[var(--tv-line)] bg-white hover:border-[var(--tv-champagne)]"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                          riskStyle[sev] ?? "bg-[#f9ddd9] text-[#9b1c13]"
                                        }`}
                                      >
                                        {f.severity ?? "FLAG"}
                                      </span>
                                      {f.flagged_text && (
                                        <strong className="text-sm text-[var(--tv-ink)]">
                                          &ldquo;{f.flagged_text}&rdquo;
                                        </strong>
                                      )}
                                    </div>

                                    {isDismissed ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-[#ddebdd] px-2.5 py-0.5 text-[11px] font-semibold text-[#1f6b3a]">
                                        <Check className="h-3 w-3" />
                                        Dismissed
                                      </span>
                                    ) : (
                                      isReviewer && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setOpenDismissId(isOpen ? null : f.id);
                                            setDismissErrors((prev) => ({ ...prev, [f.id]: "" }));
                                          }}
                                          className="rounded-lg border border-[var(--tv-line)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--tv-muted)] transition hover:border-[var(--tv-brand)] hover:text-[var(--tv-brand)]"
                                        >
                                          {isOpen ? "Cancel" : "Dismiss"}
                                        </button>
                                      )
                                    )}
                                  </div>

                                  <p className="mt-1.5 text-sm text-[var(--tv-ink)]">{f.reason}</p>
                                  {(f.rule_ref || f.source_id) && (
                                    <p className="mt-1.5 text-[var(--tv-muted)]">
                                      {f.rule_ref} {f.source_id ? `· Source ${f.source_id}` : ""}
                                    </p>
                                  )}
                                  {f.creator_explanation && (
                                    <p className="mt-2 rounded-xl bg-[#f6e7c8]/70 px-3 py-2 text-[#7a4b00]">
                                      <strong>Creator context:</strong> {f.creator_explanation}
                                    </p>
                                  )}
                                  {isDismissed && f.dismiss_reason && (
                                    <p className="mt-2 rounded-xl bg-[#ddebdd]/70 px-3 py-2 text-[#1f6b3a]">
                                      <strong>Dismissal reason:</strong> {f.dismiss_reason}
                                    </p>
                                  )}

                                  <AnimatePresence initial={false}>
                                    {isOpen && !isDismissed && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.22, ease: EDITORIAL_EASE }}
                                        className="overflow-hidden"
                                      >
                                        <div className="mt-3 space-y-2 rounded-xl border border-[var(--tv-champagne)] bg-[var(--tv-paper)]/80 p-3">
                                          <input
                                            type="text"
                                            value={dismissReasons[f.id] ?? ""}
                                            onChange={(e) => {
                                              setDismissReasons((prev) => ({
                                                ...prev,
                                                [f.id]: e.target.value,
                                              }));
                                              if (errMsg) {
                                                setDismissErrors((prev) => ({
                                                  ...prev,
                                                  [f.id]: "",
                                                }));
                                              }
                                            }}
                                            placeholder="Why is this finding a false positive or approved exception?"
                                            className="w-full rounded-lg border border-[var(--tv-line)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--tv-brand)]"
                                          />
                                          {errMsg && (
                                            <p
                                              role="alert"
                                              className="text-[11px] font-semibold text-[#9b1c13]"
                                            >
                                              {errMsg}
                                            </p>
                                          )}
                                          <button
                                            type="button"
                                            disabled={dismissingId === f.id}
                                            onClick={() => handleDismissFinding(f.id)}
                                            className="rounded-lg bg-[var(--tv-brand)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] disabled:opacity-60"
                                          >
                                            {dismissingId === f.id
                                              ? "Dismissing…"
                                              : "Confirm dismiss"}
                                          </button>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </motion.div>
                              );
                            })}
                          </div>
                        )}
{/* Reviewer Notes & Decision History */}
                        {detail?.history && detail.history.length > 0 && (
                          <div className="rounded-2xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/60 p-4">
                            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                              <History className="h-3.5 w-3.5 text-[var(--tv-brand)]" />
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
                                    className={`rounded-xl border px-3.5 py-2.5 text-xs ${
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

                    {/* Reviewer Decision Controls (Locked for Creators) */}
                    {isReviewer ? (
                      <div className="rounded-2xl border border-[var(--tv-line)] bg-[#fcf9f3] p-4">
                        <label
                          htmlFor="review-note"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]"
                        >
                          <MessageSquareWarning className="h-3.5 w-3.5 text-[var(--tv-brand)]" />
                          Reviewer note / dismissal reason
                        </label>
                        <textarea
                          id="review-note"
                          rows={2}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Optional approval note, or reason for requesting changes..."
                          className="mt-2 w-full rounded-xl border border-[var(--tv-line)] bg-white p-3 text-sm outline-none focus:border-[var(--tv-brand)]"
                        />

                        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3">
                          <motion.button
                            type="button"
                            whileHover={!submitting && !badge?.badge_code && getStatusBucket(activeDraft.status) !== "APPROVED" ? { y: -1 } : undefined}
                            whileTap={!submitting && !badge?.badge_code && getStatusBucket(activeDraft.status) !== "APPROVED" ? { scale: 0.97 } : undefined}
                            disabled={submitting || Boolean(badge?.badge_code) || getStatusBucket(activeDraft.status) === "APPROVED"}
                            onClick={() => recordDecision("approved")}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1f6b3a] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#17522c] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto sm:py-2"
                          >
                            <Check className="h-4 w-4" />
                            <span>
                              {badge?.badge_code || getStatusBucket(activeDraft.status) === "APPROVED"
                                ? "Approved"
                                : "Approve draft"}
                            </span>
                          </motion.button>
                          <motion.button
                            type="button"
                            whileHover={!submitting ? { y: -1 } : undefined}
                            whileTap={!submitting ? { scale: 0.97 } : undefined}
                            disabled={submitting}
                            onClick={() => recordDecision("changes_requested")}
                            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 sm:w-auto sm:py-2 ${
                              badge?.badge_code || getStatusBucket(activeDraft.status) === "APPROVED"
                                ? "border-[#9b1c13]/40 bg-[#f9ddd9]/55 text-[#9b1c13] hover:bg-[#f9ddd9]"
                                : "border-[var(--tv-brand)] bg-white text-[var(--tv-brand)] hover:bg-[var(--tv-paper)]"
                            }`}
                          >
                            <Sparkles className="h-4 w-4" />
                            <span>
                              {badge?.badge_code || getStatusBucket(activeDraft.status) === "APPROVED"
                                ? "Revoke approval & request changes"
                                : "Request changes"}
                            </span>
                          </motion.button>
                        </div>

                        <AnimatePresence>
                          {decisionMsg && (
                            <motion.p
                              role="status"
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className="mt-3 rounded-xl border border-[var(--tv-champagne)] bg-white p-3 text-xs font-medium text-[var(--tv-ink)]"
                            >
                              {decisionMsg}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>
                    ) : (
                       <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--tv-line)] bg-[#fcf9f3] p-4 text-xs text-[var(--tv-muted)]">
                        <div className="flex items-center gap-2.5">
                          <Lock className="h-4 w-4 shrink-0 text-[var(--tv-brand)]" />
                          <span>
                            Approval &amp; change-request controls are locked for{" "}
                            <strong>{user.role}</strong> accounts. Sign in as a{" "}
                            <strong>Reviewer</strong> to make a final decision.
                          </span>
                        </div>

                        {isCreator &&
                          !badge?.badge_code &&
                          getStatusBucket(activeDraft.status) !== "APPROVED" && (
                            <Link
                              href={`/dashboard/submit?draftId=${encodeURIComponent(activeDraft.id)}`}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--tv-brand)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[var(--tv-brand-ink)]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>
                                {getStatusBucket(activeDraft.status) === "CHANGES_REQUESTED"
                                  ? "Edit & Resubmit Draft →"
                                  : "Edit Draft →"}
                              </span>
                            </Link>
                          )}
                      </div>
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
                  </div>
                </motion.section>
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}