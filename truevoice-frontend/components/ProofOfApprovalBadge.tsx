"use client";

import { useEffect, useState } from "react";

export async function computeContentHash(text: string): Promise<string> {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const data = new TextEncoder().encode(normalized);
    const buf = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }
  // Safe fallback if crypto.subtle is unavailable
  let h = 0;
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

interface ProofOfApprovalBadgeProps {
  badgeCode: string;
  title: string;
  approvedBy: string;
  approvedAt: string;
  approvedContent: string;
}

export function ProofOfApprovalBadge({
  badgeCode,
  title,
  approvedBy,
  approvedAt,
  approvedContent,
}: ProofOfApprovalBadgeProps) {
  const [approvedHash, setApprovedHash] = useState<string>("calculating...");
  const [pastedText, setPastedText] = useState<string>("");
  const [pastedHash, setPastedHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    computeContentHash(approvedContent).then(setApprovedHash);
  }, [approvedContent]);

  useEffect(() => {
    if (!pastedText.trim()) {
      setPastedHash(null);
      return;
    }
    computeContentHash(pastedText).then(setPastedHash);
  }, [pastedText]);

  const shortUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/verify/${badgeCode}`
      : `/verify/${badgeCode}`;

  const matches = pastedHash !== null && pastedHash === approvedHash;

  function copyLink() {
    navigator.clipboard?.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="animate-pop-in rounded-2xl border-2 border-[#1f6b3a]/40 bg-white p-6 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ddebdd] px-3 py-1 text-xs font-bold text-[#1f6b3a]">
            &#10003; PROOF OF APPROVAL
          </span>
          <h3 className="mt-2 font-serif text-xl font-semibold text-[var(--tv-ink)]">{title}</h3>
          <p className="mt-1 text-xs text-[var(--tv-muted)]">
            Approved by <strong className="text-[var(--tv-ink)]">{approvedBy}</strong> &middot;{" "}
            {approvedAt}
          </p>
          <p className="mt-1 font-mono text-[11px] text-[var(--tv-muted)]">
            Fingerprint: {approvedHash}
          </p>
        </div>

        {/* Minimalist Badge QR Visual */}
        <div className="flex flex-col items-center rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)] p-2.5">
          <svg className="h-16 w-16 text-[var(--tv-brand-ink)]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm4 0h2v4h-2v-4zm-4 4h4v2h-4v-2zm0 2h2v2h-2v-2zm4 0h2v2h-2v-2z" />
          </svg>
          <span className="mt-1 font-mono text-[10px] font-semibold text-[var(--tv-brand)]">
            {badgeCode}
          </span>
        </div>
      </div>

      {/* Short Link */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--tv-paper)] px-3 py-2 text-xs">
        <span className="truncate font-mono text-[var(--tv-ink)]">{shortUrl}</span>
        <button
          type="button"
          onClick={copyLink}
          className="rounded-lg bg-[var(--tv-brand)] px-3 py-1 font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] active:scale-95"
        >
          {copied ? "Copied!" : "Copy short link"}
        </button>
      </div>

      {/* Paste-to-Compare Integrity Check (Section 10) */}
      <div className="mt-4 border-t border-[var(--tv-line)] pt-4">
        <label htmlFor={`verify-${badgeCode}`} className="block text-xs font-semibold">
          Verify published text (paste to check if content changed since approval):
        </label>
        <textarea
          id={`verify-${badgeCode}`}
          rows={2}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste the live post or ad text here to compare..."
          className="mt-1.5 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 p-2.5 text-xs outline-none focus:border-[var(--tv-brand)]"
        />

        {pastedHash !== null && (
          <div
            role="status"
            className={`animate-pop-in mt-2 rounded-xl px-3 py-2 text-xs font-semibold ${
              matches
                ? "border border-[#1f6b3a]/30 bg-[#ddebdd] text-[#1f6b3a]"
                : "border border-[#9b1c13]/30 bg-[#f9ddd9] text-[#9b1c13]"
            }`}
          >
            {matches
              ? "✓ Exact match! This text has NOT been changed since approval."
              : "⚠ Warning: Content differs from the approved version (hash mismatch)."}
          </div>
        )}
      </div>
    </div>
  );
}