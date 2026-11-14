"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

type Queue = { drafts: Draft[]; error: string | null } | null;

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

function stageIndex(status = ""): number {
  const s = status.toLowerCase();
  if (s.includes("approv")) return 2;
  if (s.includes("review")) return 1;
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
  const [ringReady, setRingReady] = useState(false);

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
        if (!cancelled) {
          const parsed = Array.isArray(list) ? (list as Draft[]) : [];
          setQueue({ drafts: parsed, error: null });
          if (parsed.length > 0) setExpandedId(parsed[0].id);
        }
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

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="animate-pop-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Welcome to TrueVoice</h1>
          <p className="mt-2 text-[var(--tv-muted)]">
            Signed in as <span className="font-semibold text-[var(--tv-ink)]">{user.name}</span> (
            {user.role}). {roleHelp[user.role] ?? ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[var(--tv-line)] bg-white px-3 py-1 text-xs text-[var(--tv-muted)] shadow-xs">
            &#10022; Gemini AI assisted &middot; Human decides
          </span>
          <Link
            href="/dashboard/submit"
            className="group inline-flex items-center gap-2 rounded-xl bg-[var(--tv-brand)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--tv-brand-ink)] hover:shadow-md active:scale-95"
          >
            <span>+ Check a new draft</span>
            <span className="transition-transform duration-300 group-hover:translate-x-0.5">&rarr;</span>
          </Link>
        </div>
      </div>

      {/* Bento Top Row */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Card 1: Count-Up Queue + Live Beacon */}
        <div className="animate-pop-in rounded-2xl border border-[var(--tv-line)] bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
            Drafts in queue
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-5xl font-semibold tabular-nums text-[var(--tv-brand)]">
              {queue ? animatedTotal : "-"}
            </span>
            <span className="text-sm text-[var(--tv-muted)]">awaiting review</span>
          </div>
          <p
            role="status"
            className={`mt-4 flex items-center gap-2 text-xs font-medium ${
              backend === "up"
                ? "text-[var(--tv-ok)]"
                : backend === "down"
                  ? "text-[var(--tv-flag)]"
                  : "text-[var(--tv-muted)]"
            }`}
          >
            <span className="relative flex h-2.5 w-2.5">
              {backend === "up" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--tv-ok)] opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  backend === "up"
                    ? "bg-[var(--tv-ok)]"
                    : backend === "down"
                      ? "bg-[var(--tv-flag)]"
                      : "bg-[var(--tv-muted)]"
                }`}
              />
            </span>
            {backend === "checking" && "Checking the backend…"}
            {backend === "up" && "Backend connected"}
            {backend === "down" && "Can't reach the backend. Start it with npm start."}
          </p>
        </div>

        {/* Card 2: 3-Color Sweeping Donut + Growing Bars */}
        <div
          style={{ animationDelay: "90ms" }}
          className="animate-pop-in flex items-center justify-between gap-4 rounded-2xl border border-[var(--tv-line)] bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
        >
          <div className="flex-1 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
              Risk breakdown
            </span>

            <div className="space-y-1.5 text-xs font-semibold">
              <div>
                <div className="flex justify-between text-[#9b1c13]">
                  <span>High risk</span>
                  <span className="tabular-nums">{queue ? animatedHigh : "-"}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f9ddd9]">
                  <div
                    className="h-full rounded-full bg-[#9b1c13] transition-all duration-1000 ease-out"
                    style={{ width: ringReady ? `${(highCount / total) * 100}%` : "0%" }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#7a4b00]">
                  <span>Medium risk</span>
                  <span className="tabular-nums">{queue ? animatedMed : "-"}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f6e7c8]">
                  <div
                    className="h-full rounded-full bg-[#c98000] transition-all duration-1000 ease-out"
                    style={{ width: ringReady ? `${(medCount / total) * 100}%` : "0%" }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#1f6b3a]">
                  <span>Low risk</span>
                  <span className="tabular-nums">{queue ? animatedLow : "-"}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#ddebdd]">
                  <div
                    className="h-full rounded-full bg-[#1f6b3a] transition-all duration-1000 ease-out"
                    style={{ width: ringReady ? `${(lowCount / total) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            </div>
          </div>

          <svg className="h-24 w-24 shrink-0" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#efe8dc" strokeWidth="3.8" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#9b1c13"
              strokeWidth="3.8"
              strokeLinecap="round"
              strokeDasharray={`${ringReady && queue ? highLen : 0} ${C}`}
              style={{ transform: `rotate(${highDeg}deg)`, transformOrigin: "50% 50%" }}
              className="transition-[stroke-dasharray] duration-1000 ease-out"
            />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#c98000"
              strokeWidth="3.8"
              strokeLinecap="round"
              strokeDasharray={`${ringReady && queue ? medLen : 0} ${C}`}
              style={{ transform: `rotate(${medDeg}deg)`, transformOrigin: "50% 50%" }}
              className="transition-[stroke-dasharray] duration-1000 ease-out"
            />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#1f6b3a"
              strokeWidth="3.8"
              strokeLinecap="round"
              strokeDasharray={`${ringReady && queue ? lowLen : 0} ${C}`}
              style={{ transform: `rotate(${lowDeg}deg)`, transformOrigin: "50% 50%" }}
              className="transition-[stroke-dasharray] duration-1000 ease-out"
            />
          </svg>
        </div>

        {/* Card 3: Workflow Promise */}
        <div
          style={{ animationDelay: "180ms" }}
          className="animate-pop-in rounded-2xl border border-[var(--tv-champagne)] bg-gradient-to-br from-[#fbf7f0] to-[#f4ead9] p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-brand)]">
            How TrueVoice checks
          </span>
          <ol className="mt-3 space-y-1.5 text-xs font-medium text-[var(--tv-ink)]">
            <li className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--tv-brand)] text-[10px] text-white">
                1
              </span>
              Exact-match rules run first
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--tv-brand)] text-[10px] text-white">
                2
              </span>
              AI checks tone &amp; cites approved source
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--tv-ok)] text-[10px] text-white">
                3
              </span>
              Human reviewer makes final call
            </li>
          </ol>
        </div>
      </div>
<StaleFactAlerts />
      {/* Main Queue + Live Auto-Scanning Demo */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Review queue</h2>
              <p className="mt-1 text-sm text-[var(--tv-muted)]">
                Click any draft row to inspect stage progress.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHighRiskFirst((v) => !v)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                highRiskFirst
                  ? "border-[var(--tv-brand)] bg-[var(--tv-brand)] text-white shadow-xs"
                  : "border-[var(--tv-line)] bg-white text-[var(--tv-brand)] hover:bg-[var(--tv-paper)]"
              }`}
            >
              Filter: {highRiskFirst ? "High risk first" : "Original order"}
            </button>
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
            <ul className="mt-4 divide-y divide-[var(--tv-line)] rounded-2xl border border-[var(--tv-line)] bg-white shadow-sm">
              {drafts.map((d, idx) => {
                const risk = (d.risk_level ?? "").toUpperCase();
                const findings = d.total_findings ?? 0;
                const high = d.high_severity_findings ?? 0;
                const isOpen = expandedId === d.id;
                const activeStage = stageIndex(d.status);

                return (
                  <li
                    key={d.id}
                    style={{ animationDelay: `${idx * 85}ms` }}
                    className="animate-pop-in px-5 py-4 transition-colors duration-200 hover:bg-[#fcf9f3]"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setExpandedId(isOpen ? null : d.id)}
                        className="flex min-w-48 flex-1 items-center gap-3 text-left"
                      >
                        <svg
                          className={`h-4 w-4 shrink-0 text-[var(--tv-muted)] transition-transform duration-300 ${
                            isOpen ? "rotate-180 text-[var(--tv-brand)]" : ""
                          }`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                        <div>
                          <p className="font-medium">{d.title ?? d.id}</p>
                          <p className="text-sm text-[var(--tv-muted)]">
                            {d.channel ?? "No channel"} &middot; {statusLabel(d.status)}
                            {d.handover_to_manager === 1 && (
                              <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                                With manager
                              </span>
                            )}
                          </p>
                        </div>
                      </button>

                      <p className="w-32 text-sm text-[var(--tv-muted)]">
                        {findings} {findings === 1 ? "finding" : "findings"}
                        {high > 0 && <>, {high} high</>}
                      </p>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-sm font-semibold ${
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
                        <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                          &rarr;
                        </span>
                      </Link>
                    </div>

                    {/* Smooth CSS Grid Accordion Drawer with Animated Progress Track */}
                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                        isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="ml-7 mt-3 rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)] px-4 py-3 text-xs">
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
                            <div
                              className="h-full rounded-full bg-[var(--tv-brand)] transition-all duration-500 ease-out"
                              style={{ width: `${((activeStage + 1) / 3) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Live Auto-Scanning Finding Preview */}
        <aside
          aria-label="Example finding"
          style={{ animationDelay: "220ms" }}
          className="animate-pop-in relative self-start overflow-hidden rounded-2xl border-2 border-[var(--tv-champagne)] bg-white p-5 shadow-sm"
        >
          {/* Sweeping Gold Scanner Beam during scanning phase */}
          {demoPhase === "scanning" && (
            <div
              aria-hidden="true"
              className="animate-scan-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-[var(--tv-champagne)]/40 to-transparent"
            />
          )}

          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">How a finding looks</h2>
            <button
              type="button"
              onClick={() => {
                setAutoDemo((v) => !v);
                setDemoPhase("scanning");
              }}
              className="rounded-full border border-[var(--tv-champagne)] bg-[var(--tv-paper)] px-2.5 py-1 text-xs font-semibold text-[var(--tv-brand)] transition hover:bg-[var(--tv-champagne)]/40"
            >
              {autoDemo ? "Pause demo" : "Replay demo"}
            </button>
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
            <span className="text-[var(--tv-muted)]">
              {demoPhase === "scanning" && "Scanning draft against approved rules…"}
              {demoPhase === "flagged" && "Mismatch caught against offer sheet"}
              {demoPhase === "fixed" && "Creator accepted approved fix"}
            </span>
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
            {demoPhase === "fixed" && (
              <span className="animate-pop-in ml-1.5 inline-block rounded bg-[#ddebdd] px-1.5 py-0.5 font-semibold text-[#1f6b3a]">
                Flat 20% off
              </span>
            )}
            !
          </p>

          <div
            className={`mt-4 transition-all duration-300 ${
              demoPhase === "scanning" ? "opacity-40" : "opacity-100"
            }`}
          >
            <p className="font-semibold text-[var(--tv-flag)]">Offer doesn&rsquo;t match</p>
            <p className="mt-1 text-sm">
              Source: approved offer sheet says 20% off, valid 20&ndash;30 Nov 2026.
            </p>
            <p className="mt-1 text-sm">Suggested fix: &ldquo;Flat 20% off.&rdquo;</p>
          </div>

          <p className="mt-4 text-xs text-[var(--tv-muted)]">Live interactive demo</p>
        </aside>
      </div>
    </div>
  );
}