"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ProofOfApprovalBadge } from "@/components/ProofOfApprovalBadge";

type VerifyResponse = {
  found?: boolean;
  badge_code?: string;
  title?: string;
  approved_by?: string;
  approved_at?: string;
  approved_content?: string;
  content_hash?: string;
};

export default function VerifyBadgePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [badge, setBadge] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<VerifyResponse>(`/verify/${encodeURIComponent(code)}`, { skipAuth: true })
      .then((res) => {
        if (!cancelled) {
          if (res?.found === false) {
            setError("Approval badge not found.");
          } else {
            setBadge(res);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not verify badge.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <main className="min-h-screen bg-[var(--tv-paper)] px-6 py-12">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <span className="font-serif text-2xl font-bold text-[var(--tv-brand)]">TrueVoice</span>
          <Link href="/dashboard" className="text-xs font-semibold text-[var(--tv-brand)] underline">
            Back to workspace
          </Link>
        </div>

        {!badge && !error && <p className="text-sm text-[var(--tv-muted)]">Verifying badge…</p>}

        {error && (
          <p role="alert" className="rounded-xl border border-[#9b1c13]/30 bg-[#f9ddd9] p-4 text-sm text-[#9b1c13]">
            {error}
          </p>
        )}

        {badge && (
          <ProofOfApprovalBadge
            badgeCode={badge.badge_code ?? code}
            title={badge.title ?? "Approved Content"}
            approvedBy={badge.approved_by ?? "Reviewer"}
            approvedAt={badge.approved_at ?? "Recorded"}
            approvedContent={badge.approved_content ?? ""}
          />
        )}
      </div>
    </main>
  );
}