"use client";

import { use } from "react";
import Link from "next/link";
import { ProofOfApprovalBadge } from "@/components/ProofOfApprovalBadge";

export default function VerifyBadgePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);

  return (
    <main className="min-h-screen bg-[var(--tv-paper)] px-6 py-12">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <span className="font-serif text-2xl font-bold text-[var(--tv-brand)]">TrueVoice</span>
          <Link href="/dashboard" className="text-xs font-semibold text-[var(--tv-brand)] underline">
            Back to workspace
          </Link>
        </div>

        <ProofOfApprovalBadge
          badgeCode={code}
          title="Summer Launch Offer Copy"
          approvedBy="Riddhi Sharma (Reviewer)"
          approvedAt="14 Nov 2026, 10:42 PM"
          approvedContent="Formulated with hyaluronic acid to help skin look smoother. Launching Friday 20 Nov with Flat 20% off."
        />
      </div>
    </main>
  );
}