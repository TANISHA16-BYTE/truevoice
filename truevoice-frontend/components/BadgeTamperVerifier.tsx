"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  QrCode,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { ProofOfApprovalBadge } from "@/components/ProofOfApprovalBadge";

export type VerifyBadgeResponse = {
  found?: boolean;
  is_revoked?: boolean;
  message?: string;
  badge_code?: string;
  title?: string;
  approved_by?: string;
  reviewer_name?: string;
  approved_at?: string;
  approved_content?: string;
  original_approved_content?: string;
  content_hash?: string;
  submitted_content_verification?: {
    matches?: boolean;
    submitted_hash?: string;
    status?: string;
    warning?: string | null;
  };
};

interface BadgeTamperVerifierProps {
  initialCode?: string;
  autoVerifyOnMount?: boolean;
}

export function BadgeTamperVerifier({
  initialCode = "",
  autoVerifyOnMount = false,
}: BadgeTamperVerifierProps) {
  const [badgeInput, setBadgeInput] = useState(initialCode);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [badge, setBadge] = useState<VerifyBadgeResponse | null>(null);

  const [publishedText, setPublishedText] = useState("");
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [integrityResult, setIntegrityResult] = useState<VerifyBadgeResponse | null>(null);

  const lookupBadge = useCallback(async (rawCode: string) => {
    const cleaned = rawCode.trim().toUpperCase();
    if (!cleaned) {
      setLookupError("Enter an approval badge code first (for example TV-APPR-A1B2C3).");
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setIntegrityResult(null);
    setIntegrityError(null);
    try {
      const res = await api<VerifyBadgeResponse>(`/verify/${encodeURIComponent(cleaned)}`, {
        skipAuth: true,
      });
      if (res?.found === false) {
        setBadge(null);
        setLookupError(res.message || "Approval badge not found.");
      } else {
        setBadge(res);
      }
    } catch (err) {
      setBadge(null);
      setLookupError(err instanceof Error ? err.message : "Approval badge not found.");
    } finally {
      setLookupLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoVerifyOnMount && initialCode.trim()) {
      void lookupBadge(initialCode);
    }
  }, [autoVerifyOnMount, initialCode, lookupBadge]);

  function handleLookupSubmit(e: FormEvent) {
    e.preventDefault();
    void lookupBadge(badgeInput);
  }

  async function runServerIntegrityCheck() {
    const activeCode = (badge?.badge_code ?? badgeInput).trim().toUpperCase();
    if (!activeCode) {
      setIntegrityError("Enter or look up a badge code first.");
      return;
    }
    if (!publishedText.trim()) {
      setIntegrityError("Paste the published post or ad text to verify against the signed hash.");
      return;
    }

    setIntegrityLoading(true);
    setIntegrityError(null);
    try {
      const res = await api<VerifyBadgeResponse>("/verify", {
        method: "POST",
        body: { badge_code: activeCode, content: publishedText },
        skipAuth: true,
      });
      if (res?.found === false) {
        setIntegrityResult(null);
        setIntegrityError(res.message || "Approval badge not found.");
      } else {
        setIntegrityResult(res);
        setBadge((prev) => prev ?? res);
      }
    } catch (err) {
      setIntegrityResult(null);
      setIntegrityError(err instanceof Error ? err.message : "Could not verify content integrity.");
    } finally {
      setIntegrityLoading(false);
    }
  }

  function loadApprovedCopy(tamper = false) {
    const original = badge?.approved_content ?? badge?.original_approved_content ?? "";
    if (!original) return;
    setPublishedText(tamper ? `${original} Plus free gift!` : original);
    setIntegrityError(null);
    setIntegrityResult(null);
  }

  const verification = integrityResult?.submitted_content_verification;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[var(--tv-champagne)] bg-white p-5 shadow-[0_20px_50px_-26px_rgba(88,24,46,0.22)] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tv-brand)] text-[var(--tv-champagne)]">
            <QrCode className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-serif text-xl font-semibold text-[var(--tv-ink)] sm:text-2xl">
              Verify Proof-of-Approval Badge
            </h1>
            <p className="mt-1 text-xs text-[var(--tv-muted)] sm:text-sm">
              Confirm a draft was reviewed by an authorized TrueVoice reviewer and verify its
              published copy with SHA-256 tamper detection.
            </p>
          </div>
        </div>

        <form onSubmit={handleLookupSubmit} className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tv-muted)]" />
            <input
              type="text"
              value={badgeInput}
              onChange={(e) => setBadgeInput(e.target.value)}
              placeholder="Enter badge code (e.g. TV-APPR-A1B2C3)"
              className="w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/55 py-2.5 pl-10 pr-3.5 font-mono text-sm uppercase outline-none transition focus:border-[var(--tv-brand)] focus:bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={lookupLoading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--tv-brand)] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[var(--tv-brand-ink)] disabled:opacity-60"
          >
            {lookupLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            <span>{lookupLoading ? "Checking…" : "Verify badge"}</span>
          </button>
        </form>

        {lookupError && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-[#9b1c13]/30 bg-[#f9ddd9] px-4 py-3 text-sm font-medium text-[#9b1c13]"
          >
            {lookupError}
          </p>
        )}
      </section>

      {badge?.is_revoked && (
        <section
          role="alert"
          className="rounded-2xl border-2 border-[#9b1c13]/40 bg-[#f9ddd9]/80 p-5 text-[#9b1c13]"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-serif text-lg font-semibold">Approval Badge Revoked</h2>
              <p className="mt-1 text-sm">
                {badge.message || "This approval badge has been revoked and is no longer valid."}
              </p>
              <p className="mt-2 text-xs opacity-85">
                Originally reviewed by {badge.reviewer_name ?? "Reviewer"}
                {badge.approved_at ? ` · ${badge.approved_at}` : ""}
              </p>
            </div>
          </div>
        </section>
      )}

      {badge && !badge.is_revoked && (
        <ProofOfApprovalBadge
          badgeCode={badge.badge_code ?? badgeInput.trim().toUpperCase()}
          title={badge.title ?? "Approved Content"}
          approvedBy={badge.reviewer_name ?? badge.approved_by ?? "Reviewer"}
          approvedAt={badge.approved_at ?? "Recorded"}
          approvedContent={badge.approved_content ?? badge.original_approved_content ?? ""}
        />
      )}

      <section className="rounded-3xl border border-[var(--tv-line)] bg-white/95 p-5 shadow-xs sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-[var(--tv-ink)] sm:text-xl">
              Server cryptographic integrity check
            </h2>
            <p className="mt-1 text-xs text-[var(--tv-muted)] sm:text-sm">
              Paste the live post, ad, or email copy below to verify its SHA-256 fingerprint
              directly against the signed TrueVoice approval record.
            </p>
          </div>
          {badge && !badge.is_revoked && (badge.approved_content || badge.original_approved_content) && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadApprovedCopy(false)}
                className="rounded-lg border border-[var(--tv-champagne)] bg-[var(--tv-paper)] px-2.5 py-1 text-xs font-semibold text-[var(--tv-ink)] transition hover:bg-[#ede4d3]"
              >
                Load approved copy
              </button>
              <button
                type="button"
                onClick={() => loadApprovedCopy(true)}
                className="rounded-lg border border-[#9b1c13]/30 bg-[#f9ddd9]/50 px-2.5 py-1 text-xs font-semibold text-[#9b1c13] transition hover:bg-[#f9ddd9]"
              >
                Simulate 1-line edit
              </button>
            </div>
          )}
        </div>

        <textarea
          rows={4}
          value={publishedText}
          onChange={(e) => setPublishedText(e.target.value)}
          placeholder="Paste published post or ad copy here to test for tampering..."
          className="mt-4 w-full rounded-2xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 p-3.5 text-sm outline-none transition focus:border-[var(--tv-brand)] focus:bg-white"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={integrityLoading}
            onClick={runServerIntegrityCheck}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--tv-brand)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] disabled:opacity-60 sm:text-sm"
          >
            {integrityLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            <span>{integrityLoading ? "Verifying hash…" : "Check server integrity"}</span>
          </button>
          {badge?.content_hash && (
            <span className="break-all font-mono text-[11px] text-[var(--tv-muted)]">
              Signed SHA-256: {badge.content_hash.slice(0, 16)}…
            </span>
          )}
        </div>

        {integrityError && (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-[#9b1c13]/30 bg-[#f9ddd9] px-3.5 py-2.5 text-xs font-medium text-[#9b1c13]"
          >
            {integrityError}
          </p>
        )}

        {verification && (
          <div
            role="status"
            className={`mt-4 rounded-2xl border p-4 text-xs sm:text-sm ${
              verification.matches
                ? "border-[#1f6b3a]/35 bg-[#ddebdd]/70 text-[#1f6b3a]"
                : "border-[#9b1c13]/35 bg-[#f9ddd9]/80 text-[#9b1c13]"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {verification.matches ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-bold">
                  {verification.matches
                    ? "VERIFIED_AUTHENTIC · Exact signed match"
                    : "MODIFIED_TAMPERED · Text changed after approval"}
                </p>
                {verification.warning && <p>{verification.warning}</p>}
                <div className="mt-2 space-y-1 rounded-xl bg-white/75 p-2.5 font-mono text-[11px] text-[var(--tv-ink)]">
                  {integrityResult?.content_hash && (
                    <p className="break-all">
                      <strong>Approved SHA-256:</strong> {integrityResult.content_hash}
                    </p>
                  )}
                  {verification.submitted_hash && (
                    <p className="break-all">
                      <strong>Submitted SHA-256:</strong> {verification.submitted_hash}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
