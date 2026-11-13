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

const startingPoints = [
  {
    href: "/dashboard/library",
    title: "Library",
    text: "The approved facts, prices and rules that every draft is checked against.",
  },
  {
    href: "/dashboard/submit",
    title: "Submit draft",
    text: "Paste a draft and see what needs fixing before a reviewer looks at it.",
  },
  {
    href: "/dashboard/review",
    title: "Review queue",
    text: "Approve, dismiss or send back drafts, with the riskiest first.",
  },
];

export default function DashboardPage() {
  const { user } = useSession();
  const [backend, setBackend] = useState<"checking" | "up" | "down">("checking");

  // Quick check that Tanisha's backend is reachable.
  useEffect(() => {
    api("/health", { skipAuth: true })
      .then(() => setBackend("up"))
      .catch(() => setBackend("down"));
  }, []);

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold">Welcome to TrueVoice</h1>
      <p className="mt-2 text-[var(--tv-muted)]">
        Signed in as {user.name} ({user.role}). {roleHelp[user.role] ?? ""}
      </p>

      <p
        role="status"
        className={`mt-6 text-sm font-medium ${
          backend === "up"
            ? "text-[var(--tv-ok)]"
            : backend === "down"
              ? "text-[var(--tv-flag)]"
              : "text-[var(--tv-muted)]"
        }`}
      >
        {backend === "checking" && "Checking the backend…"}
        {backend === "up" && "Backend connected"}
        {backend === "down" &&
          "Can't reach the backend. Start it with npm start in truevoice-backend."}
      </p>

      <h2 className="mt-10 text-xl font-semibold">Where to start</h2>
      <ul className="mt-3 divide-y divide-[var(--tv-line)] border-y border-[var(--tv-line)]">
        {startingPoints.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="block py-4 hover:bg-white">
              <span className="font-medium text-[var(--tv-brand)] underline">{item.title}</span>
              <span className="mt-1 block text-[var(--tv-muted)]">{item.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}