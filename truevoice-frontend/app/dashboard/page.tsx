"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function DashboardPage() {
  const { user } = useSession();
  const [backend, setBackend] = useState<"checking" | "up" | "down">("checking");
  const [queue, setQueue] = useState<Queue>(null);

  // Quick check that the backend is reachable.
  useEffect(() => {
    api("/health", { skipAuth: true })
      .then(() => setBackend("up"))
      .catch(() => setBackend("down"));
  }, []);

  // The real review queue from the backend.
  useEffect(() => {
    let cancelled = false;
    api<unknown>("/drafts")
      .then((data) => {
        const list = Array.isArray(data) ? data : (data as { drafts?: unknown } | null)?.drafts;
        if (!cancelled) {
          setQueue({ drafts: Array.isArray(list) ? (list as Draft[]) : [], error: null });
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

  const drafts = [...(queue?.drafts ?? [])].sort(
    (a, b) =>
      (riskRank[(a.risk_level ?? "").toUpperCase()] ?? 3) -
      (riskRank[(b.risk_level ?? "").toUpperCase()] ?? 3)
  );
  const count = (level: string) =>
    drafts.filter((d) => (d.risk_level ?? "").toUpperCase() === level).length;

  const tiles = [
    { label: "Drafts in queue", value: drafts.length },
    { label: "High risk", value: count("HIGH") },
    { label: "Medium risk", value: count("MEDIUM") },
    { label: "Low risk", value: count("LOW") },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-4xl font-semibold">Welcome to TrueVoice</h1>
      <p className="mt-2 text-[var(--tv-muted)]">
        Signed in as {user.name} ({user.role}). {roleHelp[user.role] ?? ""}
      </p>

      <p
        role="status"
        className={`mt-3 text-sm font-medium ${
          backend === "up"
            ? "text-[var(--tv-ok)]"
            : backend === "down"
              ? "text-[var(--tv-flag)]"
              : "text-[var(--tv-muted)]"
        }`}
      >
        {backend === "checking" && "Checking the backend…"}
        {backend === "up" && "Backend connected"}
        {backend === "down" && "Can't reach the backend. Start it with npm start."}
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-[var(--tv-line)] bg-white p-5">
            <dd className="font-serif text-4xl font-semibold text-[var(--tv-brand)]">
              {queue ? tile.value : "-"}
            </dd>
            <dt className="mt-1 text-sm text-[var(--tv-muted)]">{tile.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Review queue</h2>
              <p className="mt-1 text-sm text-[var(--tv-muted)]">Riskiest drafts first.</p>
            </div>
            <Link
              href="/dashboard/submit"
              className="rounded-md bg-[var(--tv-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--tv-brand-ink)]"
            >
              Check a new draft
            </Link>
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
            <ul className="mt-4 divide-y divide-[var(--tv-line)] rounded-xl border border-[var(--tv-line)] bg-white">
              {drafts.map((d) => {
                const risk = (d.risk_level ?? "").toUpperCase();
                const findings = d.total_findings ?? 0;
                const high = d.high_severity_findings ?? 0;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="min-w-48 flex-1">
                      <p className="font-medium">{d.title ?? d.id}</p>
                      <p className="text-sm text-[var(--tv-muted)]">
                        {d.channel ?? "No channel"} &middot; {statusLabel(d.status)}
                        {d.handover_to_manager === 1 && <> &middot; With manager</>}
                      </p>
                    </div>
                    <p className="w-36 text-sm text-[var(--tv-muted)]">
                      {findings} {findings === 1 ? "finding" : "findings"}
                      {high > 0 && <>, {high} high</>}
                    </p>
                    <span
                      className={`rounded-full px-3 py-0.5 text-sm font-semibold ${
                        riskStyle[risk] ?? "bg-[var(--tv-paper)]"
                      }`}
                    >
                      {riskLabel[risk] ?? "Unknown"} risk
                    </span>
                    <Link
                      href="/dashboard/review"
                      className="rounded-md border border-[var(--tv-edge)] px-3 py-1.5 text-sm hover:bg-[var(--tv-paper)]"
                    >
                      Open
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside
          aria-label="Example finding"
          className="self-start rounded-xl border-2 border-[var(--tv-champagne)] bg-white p-5"
        >
          <h2 className="mb-3 text-xl font-semibold">How a finding looks</h2>
          <p className="text-sm text-[var(--tv-muted)]">Draft</p>
          <p className="mt-1">
            Launching Friday with{" "}
            <s className="decoration-[var(--tv-flag)] decoration-2">flat 30% off</s>!
          </p>
          <p className="mt-4 font-semibold text-[var(--tv-flag)]">Offer doesn&rsquo;t match</p>
          <p className="mt-1 text-sm">
            Source: approved offer sheet says 20% off, valid 20&ndash;30 Nov 2026.
          </p>
          <p className="mt-1 text-sm">Suggested fix: &ldquo;Flat 20% off.&rdquo;</p>
          <p className="mt-4 text-xs text-[var(--tv-muted)]">Example with demo data</p>
        </aside>
      </div>
    </div>
  );
}