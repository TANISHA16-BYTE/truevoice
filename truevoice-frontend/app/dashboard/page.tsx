"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useSession } from "@/lib/SessionContext";

const roleHelp: Record<string, string> = {
  creator: "Submit drafts and fix flagged claims before they go to review.",
  reviewer: "Work through the review queue, riskiest drafts first.",
  admin: "See which rules cause repeat problems and keep the library current.",
};

// Sample data. Replace with GET /api/drafts when the review queue is connected.
const sampleQueue = [
  { name: "Email_Launch.docx", kind: "Document", risk: "High" },
  { name: "Deck_Q4_Sales.pptx", kind: "Slides", risk: "Medium" },
  { name: "Banner_Diwali.png", kind: "Image", risk: "Low" },
  { name: "Post_Teaser.txt", kind: "Text", risk: "Low" },
];

const riskStyle: Record<string, string> = {
  High: "bg-[#f9ddd9] text-[#9b1c13]",
  Medium: "bg-[#f6e7c8] text-[#7a4b00]",
  Low: "bg-[#ddebdd] text-[#1f6b3a]",
};

export default function DashboardPage() {
  const { user } = useSession();
  const [backend, setBackend] = useState<"checking" | "up" | "down">("checking");

  // Quick check that the backend is reachable.
  useEffect(() => {
    api("/health", { skipAuth: true })
      .then(() => setBackend("up"))
      .catch(() => setBackend("down"));
  }, []);

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

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="text-2xl font-semibold">Review queue</h2>
          <p className="mt-1 text-sm text-[var(--tv-muted)]">
            Sample data until the queue is connected to the backend.
          </p>
          <ul className="mt-4 divide-y divide-[var(--tv-line)] rounded-xl border border-[var(--tv-line)] bg-white">
            {sampleQueue.map((item) => (
              <li key={item.name} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="min-w-40 flex-1 font-medium">{item.name}</span>
                <span className="w-24 text-[var(--tv-muted)]">{item.kind}</span>
                <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${riskStyle[item.risk]}`}>
                  {item.risk} risk
                </span>
                <Link
                  href="/dashboard/review"
                  className="rounded-md border border-[var(--tv-edge)] px-3 py-1.5 text-sm hover:bg-[var(--tv-paper)]"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <aside
          aria-label="Example finding"
          className="self-start rounded-xl border-2 border-[var(--tv-champagne)] bg-white p-5"
        >
          <h2 className="mb-3 text-xl font-semibold">Latest finding</h2>
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