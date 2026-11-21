"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { BadgeTamperVerifier } from "@/components/BadgeTamperVerifier";

export default function VerifyLookupPage() {
  const [queryCode, setQueryCode] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code")?.trim() ?? "";
    setQueryCode(code);
    setReady(true);
  }, []);

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
            <Link href="/login" className="underline hover:text-[var(--tv-brand-ink)]">
              Log in
            </Link>
            <Link href="/dashboard" className="underline hover:text-[var(--tv-brand-ink)]">
              Workspace
            </Link>
          </div>
        </div>

        {ready && (
          <BadgeTamperVerifier
            key={queryCode || "lookup"}
            initialCode={queryCode}
            autoVerifyOnMount={Boolean(queryCode)}
          />
        )}
      </div>
    </main>
  );
}
