"use client";

import { use } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { BadgeTamperVerifier } from "@/components/BadgeTamperVerifier";

export default function VerifyBadgePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);

  return (
    <main className="min-h-screen bg-[var(--tv-paper)] px-4 py-10 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[var(--tv-brand)]">
            <Logo />
            <span className="rounded-full border border-[var(--tv-champagne)] bg-white px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tv-brand)]">
              Public Verification
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold text-[var(--tv-brand)]">
            <Link href="/verify" className="underline hover:text-[var(--tv-brand-ink)]">
              Look up another badge
            </Link>
            <Link href="/dashboard" className="underline hover:text-[var(--tv-brand-ink)]">
              Back to workspace
            </Link>
          </div>
        </div>

        <BadgeTamperVerifier initialCode={code} autoVerifyOnMount />
      </div>
    </main>
  );
}
