"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { StaleFactAlerts } from "@/components/StaleFactAlerts";
import { api } from "@/lib/api";
import { useSession } from "@/lib/SessionContext";

type Draft = {
  id: string;
  title?: string;
  channel?: string | null;
  status?: string;
  risk_level?: string;
  total_findings?: number;
  high_severity_findings?: number;
  handover_to_manager?: number;
};

type ReviewerNote = {
  action: string;
  actor_name: string;
  details: string;
};

type HistoryItem = {
  action?: string;
  actor_name?: string;
  actor?: string;
  details?: string;
  note?: string;
  timestamp?: string;
  created_at?: string;
};

type DraftMeta = {
  status?: string;
  hasBadge: boolean;
  history: HistoryItem[];
  reviewerNote: ReviewerNote | null;
};

type Queue = { drafts: Draft[]; error: string | null } | null;
type RiskKey = "HIGH" | "MEDIUM" | "LOW";

const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const;

const roleHelp: Record<string, string> = {
  creator: "Submit drafts and fix flagged claims before they go to review.",
  reviewer: "Work through the review queue, riskiest drafts first.",
  admin: "See which rules cause repeat problems and keep the library current.",
};

const riskStyle: Record<string, string> = {
  HIGH: "bg-[#f9ddd9] text-[#9b1c13]",
  MEDIUM: "bg-[#f6e7c8] text-[#7a4b00]",
  LOW: "bg-[#ddebdd] text-[#1f6b3a]",
};

const riskLabel: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const riskRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function statusLabel(status = ""): string {
  const words = status.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
}

function pickLatestDecision(history: HistoryItem[]): ReviewerNote | null {
  const decisions = history.filter((h) => {
    const a = (h.action ?? "").toUpperCase();
    return a === "CHANGES_REQUESTED" || a === "APPROVED";
  });
  if (decisions.length === 0) return null;

  const hasTimestamps = decisions.some((d) => Boolean(d.timestamp || d.created_at));
  const chosen = hasTimestamps
    ? [...decisions].sort((a, b) => {
        const ta = Date.parse(a.timestamp ?? a.created_at ?? "") || 0;
        const tb = Date.parse(b.timestamp ?? b.created_at ?? "") || 0;
        return tb - ta;
      })[0]
    : decisions[decisions.length - 1];

  return {
    action: (chosen.action ?? "").toUpperCase(),
    actor_name: chosen.actor_name ?? chosen.actor ?? "Reviewer",
    details: (chosen.details ?? chosen.note ?? "").trim(),
  };
}

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

function useCountUp(target: number, enabled: boolean, duration = 700): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (target === 0) {
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

export default function DashboardPage() {
  const { user } = useSession();
  const [backend, setBackend] = useState<"checking" | "up" | "down">("checking");
  const [queue, setQueue] = useState<Queue>(null);
  const [highRiskFirst, setHighRiskFirst] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [metaByDraft, setMetaByDraft] = useState<Record<string, DraftMeta>>({});
  const [ringReady, setRingReady] = useState(false);

  // Interactive Bento states
  const [hoveredRisk, setHoveredRisk] = useState<RiskKey | null>(null);
  const [activeCheckStep, setActiveCheckStep] = useState(0);
  const [stepHovered, setStepHovered] = useState(false);

  // Live animated demo cycle: "scanning" -> "flagged" -> "fixed"
  const [demoPhase, setDemoPhase] = useState<"scanning" | "flagged" | "fixed">("scanning");
  const [autoDemo, setAutoDemo] = useState(true);

  useEffect(() => {
    api("/health", { skipAuth: true })
      .then(() => setBackend("up"))
      .catch(() => setBackend("down"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<unknown>("/drafts")
      .then((data) => {
        const list = Array.isArray(data) ? data : (data as { drafts?: unknown } | null)?.drafts;
        if (cancelled) return;

        const parsed = Array.isArray(list) ? (list as Draft[]) : [];
        setQueue({ drafts: parsed, error: null });
        if (parsed.length > 0) setExpandedId(parsed[0].id);

        // Prefetch approval badge & history for each draft so stage bars & reviewer notes show immediately
        Promise.allSettled(
          parsed.map((d) =>
            api<{
              draft?: { status?: string };
              approval_badge?: { badge_code?: string } | null;
              history?: HistoryItem[];
            }>(`/drafts/${d.id}`).then((detail) => ({ id: d.id, detail }))
          )
        ).then((results) => {
          if (cancelled) return;
          const nextMeta: Record<string, DraftMeta> = {};
          for (const r of results) {
            if (r.status !== "fulfilled") continue;
            const { id, detail } = r.value;
            const history = detail.history ?? [];
            nextMeta[id] = {
              status: detail.draft?.status,
              hasBadge: Boolean(detail.approval_badge?.badge_code),
              history,
              reviewerNote: pickLatestDecision(history),
            };
          }
          setMetaByDraft((prev) => ({ ...prev, ...nextMeta }));
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setQueue({
            drafts: [],
            error: err instanceof Error ? err.message : "Could not load the review queue.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!queue) return;
    const t = setTimeout(() => setRingReady(true), 80);
    return () => clearTimeout(t);
  }, [queue]);

  // Subtle step highlight loop on the "How TrueVoice checks" Bento card
  useEffect(() => {
    if (stepHovered) return;
    const t = setInterval(() => {
      setActiveCheckStep((s) => (s + 1) % 3);
    }, 2400);
    return () => clearInterval(t);
  }, [stepHovered]);

  // Continuous live demo loop on the right-hand finding card
  useEffect(() => {
    if (!autoDemo) return;
    const nextDelay = demoPhase === "scanning" ? 1300 : 2400;
    const t = setTimeout(() => {
      setDemoPhase((p) =>
        p === "scanning" ? "flagged" : p === "flagged" ? "fixed" : "scanning"
      );
    }, nextDelay);
    return () => clearTimeout(t);
  }, [demoPhase, autoDemo]);

  const rawDrafts = queue?.drafts ?? [];
  const drafts = highRiskFirst
    ? [...rawDrafts].sort(
        (a, b) =>
          (riskRank[(a.risk_level ?? "").toUpperCase()] ?? 3) -
          (riskRank[(b.risk_level ?? "").toUpperCase()] ?? 3)
      )
    : rawDrafts;

  const count = (level: string) =>
    rawDrafts.filter((d) => (d.risk_level ?? "").toUpperCase() === level).length;

  const highCount = count("HIGH");
  const medCount = count("MEDIUM");
  const lowCount = count("LOW");
  const total = Math.max(rawDrafts.length, 1);

  const animatedTotal = useCountUp(rawDrafts.length, queue !== null);
  const animatedHigh = useCountUp(highCount, queue !== null);
  const animatedMed = useCountUp(medCount, queue !== null);
  const animatedLow = useCountUp(lowCount, queue !== null);

  // 3-color donut ring geometry
  const C = 97.4;
  const highLen = (highCount / total) * C;
  const medLen = (medCount / total) * C;
  const lowLen = (lowCount / total) * C;
  const highDeg = -90;
  const medDeg = highDeg + (highCount / total) * 360;
  const lowDeg = medDeg + (medCount / total) * 360;

  const riskRows: {
    key: RiskKey;
    label: string;
    count: number;
    animated: number;
    textClass: string;
    trackClass: string;
    fillClass: string;
    colorHex: string;
  }[] = [
    {
      key: "HIGH",
      label: "High risk",
      count: highCount,
      animated: animatedHigh,
      textClass: "text-[#9b1c13]",
      trackClass: "bg-[#f9ddd9]",
      fillClass: "bg-[#9b1c13]",
      colorHex: "#9b1c13",
    },
    {
      key: "MEDIUM",
      label: "Medium risk",
      count: medCount,
      animated: animatedMed,
      textClass: "text-[#7a4b00]",
      trackClass: "bg-[#f6e7c8]",
      fillClass: "bg-[#c98000]",
      colorHex: "#c98000",
    },
    {
      key: "LOW",
      label: "Low risk",
      count: lowCount,
      animated: animatedLow,
      textClass: "text-[#1f6b3a]",
      trackClass: "bg-[#ddebdd]",
      fillClass: "bg-[#1f6b3a]",
      colorHex: "#1f6b3a",
    },
  ];

  const checkSteps = [
    { num: 1, label: "Exact-match rules run first", icon: ShieldCheck, accent: "brand" },
    { num: 2, label: "AI checks tone & cites approved source", icon: Sparkles, accent: "brand" },
    { num: 3, label: "Human reviewer makes final call", icon: UserCheck, accent: "ok" },
  ] as const;

  const donutCenterValue =
    hoveredRisk === "HIGH"
      ? highCount
      : hoveredRisk === "MEDIUM"
        ? medCount
        : hoveredRisk === "LOW"
          ? lowCount
          : rawDrafts.length;

  const donutCenterLabel =
    hoveredRisk === "HIGH"
      ? "High"
      : hoveredRisk === "MEDIUM"
        ? "Med"
        : hoveredRisk === "LOW"
          ? "Low"
          : rawDrafts.length === 1
            ? "draft"
            : "drafts";

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EDITORIAL_EASE }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold sm:text-4xl">Welcome to TrueVoice</h1>
          <p className="mt-2 text-sm text-[var(--tv-muted)] sm:text-base">
            Signed in as <span className="font-semibold text-[var(--tv-ink)]">{user.name}</span> (
            {user.role}). {roleHelp[user.role] ?? ""}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--tv-line)] bg-white px-3 py-1.5 text-xs text-[var(--tv-muted)] shadow-xs">
            <Sparkles className="h-3.5 w-3.5 text-[var(--tv-brand)]" />
            Gemini AI assisted &middot; Human decides
          </span>
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className="w-full sm:w-auto">
            <Link
              href="/dashboard/submit"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--tv-brand)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors duration-200 hover:bg-[var(--tv-brand-ink)] hover:shadow-md sm:w-auto"
            >
              <span>+ Check a new draft</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>
      </motion.div>

      {/* Asymmetric Editorial Bento Row (12 columns) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Card 1 (Hero Burgundy): Drafts in Queue + Live Beacon */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EDITORIAL_EASE }}
          whileHover={{ y: -4 }}
          className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--tv-brand-ink)] bg-[var(--tv-brand)] p-5 text-[#FAF6EE] shadow-sm transition-shadow duration-300 hover:shadow-md lg:col-span-4"
        >
          {/* Subtle champagne radial highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#EFE5CE]/15 blur-2xl"
          />

          <div className="relative flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#EFE5CE]/80">
              Drafts in queue
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#EFE5CE]/20 bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#EFE5CE]">
              <Activity className="h-3 w-3" />
              Live
            </span>
          </div>

          <div className="relative my-3 flex items-baseline gap-2.5">
            <span className="font-serif text-5xl font-semibold tabular-nums tracking-tight text-[#FAF6EE] sm:text-6xl">
              {queue ? animatedTotal : "-"}
            </span>
            <span className="text-sm text-[#EFE5CE]/85">awaiting review</span>
          </div>

          <p
            role="status"
            className="relative inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-xs font-medium text-[#FAF6EE]"
          >
            <span className="relative flex h-2.5 w-2.5">
              {backend === "up" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  backend === "up"
                    ? "bg-emerald-400"
                    : backend === "down"
                      ? "bg-rose-400"
                      : "bg-[#EFE5CE]/60"
                }`}
              />
            </span>
            {backend === "checking" && "Checking the backend…"}
            {backend === "up" && "Backend connected"}
            {backend === "down" && "Can't reach the backend. Start it with npm start."}
          </p>
        </motion.div>

        {/* Card 2 (5 cols): Interactive Risk Breakdown + Reactive Donut */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: EDITORIAL_EASE }}
          whileHover={{ y: -4 }}
          className="flex flex-col-reverse gap-5 rounded-2xl border border-[var(--tv-line)] bg-white p-5 shadow-sm transition-shadow duration-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between lg:col-span-5"
        >
          <div className="w-full flex-1 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                Risk breakdown
              </span>
              <span className="text-[11px] text-[var(--tv-muted)]">Hover to inspect</span>
            </div>

            <div className="space-y-1.5 text-xs font-semibold">
              {riskRows.map((row) => {
                const isHovered = hoveredRisk === row.key;
                const isDimmed = hoveredRisk !== null && !isHovered;
                return (
                  <div
                    key={row.key}
                    onMouseEnter={() => setHoveredRisk(row.key)}
                    onMouseLeave={() => setHoveredRisk(null)}
                    className={`cursor-default rounded-lg px-2 py-1.5 transition-all duration-200 ${
                      isHovered
                        ? "bg-[var(--tv-paper)] ring-1 ring-[var(--tv-champagne)]"
                        : isDimmed
                          ? "opacity-55"
                          : ""
                    }`}
                  >
                    <div className={`flex justify-between ${row.textClass}`}>
                      <span>{row.label}</span>
                      <span className="tabular-nums">{queue ? row.animated : "-"}</span>
                    </div>
                    <div className={`mt-1 h-1.5 overflow-hidden rounded-full ${row.trackClass}`}>
                      <motion.div
                        initial={{ width: "0%" }}
                        animate={{
                          width: ringReady ? `${(row.count / total) * 100}%` : "0%",
                        }}
                        transition={{ duration: 0.85, ease: EDITORIAL_EASE }}
                        className={`h-full rounded-full ${row.fillClass}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reactive SVG Donut */}
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center self-center">
            <svg className="h-full w-full" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#efe8dc" strokeWidth="3.6" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="#9b1c13"
                strokeWidth={hoveredRisk === "HIGH" ? 5 : 3.8}
                strokeLinecap="round"
                strokeDasharray={`${ringReady && queue ? highLen : 0} ${C}`}
                style={{
                  transform: `rotate(${highDeg}deg)`,
                  transformOrigin: "50% 50%",
                  opacity: hoveredRisk && hoveredRisk !== "HIGH" ? 0.25 : 1,
                }}
                className="transition-all duration-300 ease-out"
              />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="#c98000"
                strokeWidth={hoveredRisk === "MEDIUM" ? 5 : 3.8}
                strokeLinecap="round"
                strokeDasharray={`${ringReady && queue ? medLen : 0} ${C}`}
                style={{
                  transform: `rotate(${medDeg}deg)`,
                  transformOrigin: "50% 50%",
                  opacity: hoveredRisk && hoveredRisk !== "MEDIUM" ? 0.25 : 1,
                }}
                className="transition-all duration-300 ease-out"
              />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="#1f6b3a"
                strokeWidth={hoveredRisk === "LOW" ? 5 : 3.8}
                strokeLinecap="round"
                strokeDasharray={`${ringReady && queue ? lowLen : 0} ${C}`}
                style={{
                  transform: `rotate(${lowDeg}deg)`,
                  transformOrigin: "50% 50%",
                  opacity: hoveredRisk && hoveredRisk !== "LOW" ? 0.25 : 1,
                }}
                className="transition-all duration-300 ease-out"
              />
            </svg>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={hoveredRisk ?? "ALL"}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.16 }}
                >
                  <span className="block font-serif text-xl font-semibold leading-none tabular-nums text-[var(--tv-ink)]">
                    {queue ? donutCenterValue : "-"}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wider text-[var(--tv-muted)]">
                    {donutCenterLabel}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Card 3 (3 cols): Interactive Workflow Promise */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.16, ease: EDITORIAL_EASE }}
          whileHover={{ y: -4 }}
          onMouseEnter={() => setStepHovered(true)}
          onMouseLeave={() => setStepHovered(false)}
          className="flex flex-col justify-between rounded-2xl border border-[var(--tv-champagne)] bg-gradient-to-br from-[#fbf7f0] to-[#f4ead9] p-5 shadow-sm transition-shadow duration-300 hover:shadow-md lg:col-span-3"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-brand)]">
            How TrueVoice checks
          </span>
          <ol className="mt-3 space-y-2 text-xs font-medium text-[var(--tv-ink)]">
            {checkSteps.map((step, idx) => {
              const Icon = step.icon;
              const isCurrent = activeCheckStep === idx;
              const badgeColor =
                step.accent === "ok" ? "bg-[var(--tv-ok)]" : "bg-[var(--tv-brand)]";
              return (
                <li
                  key={step.num}
                  onMouseEnter={() => setActiveCheckStep(idx)}
                  className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-all duration-300 ${
                    isCurrent
                      ? "bg-white/85 shadow-xs ring-1 ring-[var(--tv-champagne)]"
                      : "opacity-80"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] text-white transition-transform duration-300 ${badgeColor} ${
                      isCurrent ? "scale-110" : ""
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="leading-snug">{step.label}</span>
                </li>
              );
            })}
          </ol>
        </motion.div>
      </div>

      <StaleFactAlerts />

      {/* Main Queue + Live Auto-Scanning Demo */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold sm:text-2xl">Review queue</h2>
              <p className="mt-1 text-sm text-[var(--tv-muted)]">
                Click any draft row to inspect stage progress.
              </p>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => setHighRiskFirst((v) => !v)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                highRiskFirst
                  ? "border-[var(--tv-brand)] bg-[var(--tv-brand)] text-white shadow-xs"
                  : "border-[var(--tv-line)] bg-white text-[var(--tv-brand)] hover:bg-[var(--tv-paper)]"
              }`}
            >
              Filter: {highRiskFirst ? "High risk first" : "Original order"}
            </motion.button>
          </div>

          {queue === null && <p className="mt-4 text-[var(--tv-muted)]">Loading the queue…</p>}

          {queue?.error && (
            <p role="alert" className="mt-4 text-[var(--tv-flag)]">
              {queue.error}
            </p>
          )}

          {queue && !queue.error && drafts.length === 0 && (
            <p className="mt-4 rounded-md border border-dashed border-[var(--tv-edge)] p-4">
              No drafts in the queue yet. Check a draft to get started.
            </p>
          )}

          {drafts.length > 0 && (
            <ul className="mt-4 divide-y divide-[var(--tv-line)] overflow-hidden rounded-2xl border border-[var(--tv-line)] bg-white shadow-sm">
              {drafts.map((d, idx) => {
                const risk = (d.risk_level ?? "").toUpperCase();
                const findings = d.total_findings ?? 0;
                const high = d.high_severity_findings ?? 0;
                const isOpen = expandedId === d.id;
                const meta = metaByDraft[d.id];
                const effectiveStatus = meta?.status ?? d.status;
                const reviewerNote = meta?.reviewerNote ?? null;
                const activeStage = stageIndex(
                  effectiveStatus,
                  meta?.hasBadge ?? false,
                  meta?.history ?? []
                );
                const displayStatus =
                  activeStage === 2
                    ? "Approved"
                    : reviewerNote?.action === "CHANGES_REQUESTED"
                      ? "Changes requested"
                      : statusLabel(effectiveStatus);

                return (
                  <motion.li
                    key={d.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      layout: { duration: 0.3, ease: EDITORIAL_EASE },
                      opacity: { duration: 0.3, delay: idx * 0.05 },
                      y: { duration: 0.3, delay: idx * 0.05, ease: EDITORIAL_EASE },
                    }}
                    className="px-4 py-4 transition-colors duration-200 hover:bg-[#fcf9f3] sm:px-5"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setExpandedId(isOpen ? null : d.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-[var(--tv-muted)] transition-transform duration-300 ${
                            isOpen ? "rotate-180 text-[var(--tv-brand)]" : ""
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{d.title ?? d.id}</p>
                          <p className="text-sm text-[var(--tv-muted)]">
                            {d.channel ?? "No channel"} &middot; {displayStatus}
                            {d.handover_to_manager === 1 && (
                              <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                                With manager
                              </span>
                            )}
                            {reviewerNote?.action === "CHANGES_REQUESTED" && (
                              <span className="ml-1.5 rounded bg-[#f9ddd9] px-1.5 py-0.5 text-xs font-semibold text-[#9b1c13]">
                                Changes requested
                              </span>
                            )}
                          </p>
                          {!isOpen && reviewerNote?.details && (
                            <p
                              className={`mt-1 line-clamp-1 text-xs ${
                                reviewerNote.action === "CHANGES_REQUESTED"
                                  ? "text-[#9b1c13]"
                                  : "text-[#1f6b3a]"
                              }`}
                            >
                              <strong>{reviewerNote.actor_name}:</strong> {reviewerNote.details}
                            </p>
                          )}
                        </div>
                      </button>

                      <p className="text-sm text-[var(--tv-muted)] sm:w-32">
                        {findings} {findings === 1 ? "finding" : "findings"}
                        {high > 0 && <>, {high} high</>}
                      </p>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold sm:text-sm ${
                          riskStyle[risk] ?? "bg-[var(--tv-paper)]"
                        }`}
                      >
                        {risk === "HIGH" && (
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#9b1c13] opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#9b1c13]" />
                          </span>
                        )}
                        {riskLabel[risk] ?? "Unknown"} risk
                      </span>

                      <Link
                        href="/dashboard/review"
                        className="group inline-flex items-center gap-1 rounded-lg border border-[var(--tv-edge)] px-3 py-1.5 text-sm font-medium transition-all hover:border-[var(--tv-brand)] hover:bg-[var(--tv-paper)] active:scale-95"
                      >
                        <span>Open</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </Link>
                    </div>

                    {/* Smooth Framer Motion Accordion Drawer with Animated Progress Track */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="drawer"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: EDITORIAL_EASE }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)] px-3 py-3 text-xs sm:ml-7 sm:px-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-[var(--tv-muted)]">Workflow:</span>
                                {(["Creator", "Reviewer", "Approved"] as const).map((s, i) => (
                                  <span key={s} className="flex items-center gap-1.5">
                                    <span
                                      className={`rounded-full px-2.5 py-0.5 font-semibold transition-all duration-300 ${
                                        i <= activeStage
                                          ? "bg-[var(--tv-brand)] text-white shadow-xs"
                                          : "bg-white text-[var(--tv-muted)]"
                                      }`}
                                    >
                                      {s}
                                    </span>
                                    {i < 2 && <span className="text-[var(--tv-muted)]">&rarr;</span>}
                                  </span>
                                ))}
                              </div>
                              <Link
                                href="/dashboard/review"
                                className="font-semibold text-[var(--tv-brand)] underline"
                              >
                                Inspect findings &rarr;
                              </Link>
                            </div>

                            {/* Animated stage progress bar */}
                            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#e6dccb]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${((activeStage + 1) / 3) * 100}%` }}
                                transition={{ duration: 0.5, ease: EDITORIAL_EASE }}
                                className="h-full rounded-full bg-[var(--tv-brand)]"
                              />
                            </div>

                            {/* Latest Reviewer Note */}
                            {reviewerNote &&
                              (reviewerNote.details ||
                                reviewerNote.action === "CHANGES_REQUESTED") && (
                                <p
                                  className={`mt-2.5 rounded-lg px-3 py-2 text-xs ${
                                    reviewerNote.action === "CHANGES_REQUESTED"
                                      ? "bg-[#f9ddd9] text-[#9b1c13]"
                                      : "bg-[#ddebdd] text-[#1f6b3a]"
                                  }`}
                                >
                                  <strong>
                                    {reviewerNote.action === "CHANGES_REQUESTED"
                                      ? "Changes requested"
                                      : "Reviewer note"}{" "}
                                    ({reviewerNote.actor_name}):
                                  </strong>{" "}
                                  {reviewerNote.details || "Please review and update this draft."}
                                </p>
                              )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Live Auto-Scanning Finding Preview */}
        <motion.aside
          aria-label="Example finding"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2, ease: EDITORIAL_EASE }}
          className="relative self-start overflow-hidden rounded-2xl border-2 border-[var(--tv-champagne)] bg-white p-4 shadow-sm sm:p-5"
        >
          {/* Sweeping Champagne Scanner Beam during scanning phase */}
          <AnimatePresence>
            {demoPhase === "scanning" && (
              <motion.div
                key="scanner"
                aria-hidden="true"
                initial={{ x: "-100%", opacity: 0 }}
                animate={{ x: "220%", opacity: [0, 1, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{ repeat: Infinity, duration: 1.3, ease: "easeInOut" }}
                className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-[var(--tv-champagne)]/45 to-transparent"
              />
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold sm:text-xl">How a finding looks</h2>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                setAutoDemo((v) => !v);
                setDemoPhase("scanning");
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--tv-champagne)] bg-[var(--tv-paper)] px-2.5 py-1 text-xs font-semibold text-[var(--tv-brand)] transition hover:bg-[var(--tv-champagne)]/40"
            >
              {autoDemo ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {autoDemo ? "Pause demo" : "Replay demo"}
            </motion.button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs font-semibold">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                demoPhase === "scanning"
                  ? "animate-ping bg-amber-500"
                  : demoPhase === "flagged"
                    ? "bg-[var(--tv-flag)]"
                    : "bg-[var(--tv-ok)]"
              }`}
            />
            <AnimatePresence mode="wait">
              <motion.span
                key={demoPhase}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-[var(--tv-muted)]"
              >
                {demoPhase === "scanning" && "Scanning draft against approved rules…"}
                {demoPhase === "flagged" && "Mismatch caught against offer sheet"}
                {demoPhase === "fixed" && "Creator accepted approved fix"}
              </motion.span>
            </AnimatePresence>
          </div>

          <p className="mt-3 text-sm text-[var(--tv-muted)]">Draft</p>
          <p className="mt-1 min-h-[3rem] text-base">
            Launching Friday with{" "}
            <span
              className={`rounded px-1 transition-all duration-300 ${
                demoPhase === "scanning"
                  ? "bg-amber-100"
                  : "bg-[#f9ddd9] line-through decoration-[var(--tv-flag)] decoration-2"
              }`}
            >
              flat 30% off
            </span>
            <AnimatePresence>
              {demoPhase === "fixed" && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.85, x: -4 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  className="ml-1.5 inline-block rounded bg-[#ddebdd] px-1.5 py-0.5 font-semibold text-[#1f6b3a]"
                >
                  Flat 20% off
                </motion.span>
              )}
            </AnimatePresence>
            !
          </p>

          <motion.div
            animate={{ opacity: demoPhase === "scanning" ? 0.45 : 1 }}
            transition={{ duration: 0.3 }}
            className="mt-4"
          >
            <p className="font-semibold text-[var(--tv-flag)]">Offer doesn&rsquo;t match</p>
            <p className="mt-1 text-sm">
              Source: approved offer sheet says 20% off, valid 20&ndash;30 Nov 2026.
            </p>
            <p className="mt-1 text-sm">Suggested fix: &ldquo;Flat 20% off.&rdquo;</p>
          </motion.div>

          <p className="mt-4 text-xs text-[var(--tv-muted)]">Live interactive demo</p>
        </motion.aside>
      </div>
    </div>
  );
}