"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  Check,
  ChevronDown,
  FileText,
  Flag,
  Loader2,
  Mail,
  Monitor,
  Share2,
  Sparkles,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/SessionContext";

type Finding = {
  id: string;
  type?: string;
  severity?: string;
  flagged_text?: string;
  rule_ref?: string | null;
  source_id?: string | null;
  reason?: string;
  suggested_fix?: string | null;
  confidence?: number | null;
};

type CheckResult = {
  risk_level?: string;
  findings_count?: number;
  findings?: Finding[];
  summary?: {
    high_severity_count?: number;
    medium_severity_count?: number;
    low_severity_count?: number;
    unverified_count?: number;
  };
};

type CreateDraftResponse = {
  id?: string;
  draft_id?: string;
  status?: string;
  risk_level?: string;
  findings_count?: number;
  findings?: Finding[];
};

type UploadResponse = {
  filename?: string;
  file_type?: string;
  extracted_length?: number;
  extracted_content?: string;
  visual_summary?: string | null;
  visual_findings_count?: number;
  check_result?: CheckResult;
};

const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const;

const EXAMPLE =
  "Our serum is clinically proven to remove wrinkles in 3 days. Launching Friday 20 Nov with flat 30% off!";

const CHECK_STEPS = [
  "1. Cleaning text & splitting claims",
  "2. Running exact-match rules (prices, dates)",
  "3. Checking claims against approved library",
];

const CHANNELS = [
  { id: "Instagram", icon: Share2 },
  { id: "Email", icon: Mail },
  { id: "Display Ads", icon: Monitor },
  { id: "Sales", icon: Briefcase },
] as const;

const severityStyle: Record<string, string> = {
  HIGH: "bg-[#f9ddd9] text-[#9b1c13]",
  MEDIUM: "bg-[#f6e7c8] text-[#7a4b00]",
  LOW: "bg-[#ddebdd] text-[#1f6b3a]",
};

const severityBarColor: Record<string, string> = {
  HIGH: "bg-[#9b1c13]",
  MEDIUM: "bg-[#c98000]",
  LOW: "bg-[#1f6b3a]",
};

const severityLabel: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const severityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function typeLabel(type = ""): string {
  if (/unverified/i.test(type)) return "Unverified, needs source";
  if (/visual/i.test(type)) return "Visual / Logo check";
  const words = type.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Finding";
}

function needsPerson(type = ""): boolean {
  return /clash|schedule/i.test(type);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function SubmitPage() {
  const { user } = useSession();
  const canReportMistake = user?.role === "reviewer" || user?.role === "admin";

  const [draftTitle, setDraftTitle] = useState("");
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
const [loadingEditDraft, setLoadingEditDraft] = useState(false);
const [reviewerFeedback, setReviewerFeedback] = useState<{
  actor: string;
  note: string;
} | null>(null);
  const [channel, setChannel] = useState("Instagram");
  const [text, setText] = useState("");
  const [checkedText, setCheckedText] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [visualSummary, setVisualSummary] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Magnetic Dropzone & Typewriter state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const typewriterRef = useRef<number | null>(null);

  // Save draft & handover state (POST /drafts, POST /drafts/:id/handover)
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [openWhyId, setOpenWhyId] = useState<string | null>(null);
  const [whyNotes, setWhyNotes] = useState<Record<string, string>>({});
  const [handingId, setHandingId] = useState<string | null>(null);
  const [handedIds, setHandedIds] = useState<Record<string, boolean>>({});

  // Report AI Mistake state (POST /api/ai-mistakes)
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [mistakeForm, setMistakeForm] = useState({
    phrase: "",
    region: "India",
    user_correction: "",
  });
  const [mistakeSavingId, setMistakeSavingId] = useState<string | null>(null);
  const [mistakeStatus, setMistakeStatus] = useState<Record<string, string>>({});

  function stopTypewriter(finishExample = false) {
    if (typewriterRef.current !== null) {
      window.clearInterval(typewriterRef.current);
      typewriterRef.current = null;
      if (finishExample) setText(EXAMPLE);
    }
  }

  useEffect(() => {
    return () => stopTypewriter(false);
  }, []);

  // Advance the 3-step pipeline animation while /check or /upload is running.
  useEffect(() => {
    if (!loading && !uploadingFile) return;
    const timer = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, 2));
    }, 450);
    return () => clearInterval(timer);
  }, [loading, uploadingFile]);

  useEffect(() => {
  const draftId = new URLSearchParams(window.location.search).get("draftId");
  if (!draftId) return;

  let cancelled = false;
  setLoadingEditDraft(true);
  setError(null);

  api<{
    draft?: { id: string; title?: string; channel?: string; content?: string; text?: string };
    history?: { action?: string; actor_name?: string; actor?: string; details?: string; note?: string }[];
  }>(`/drafts/${encodeURIComponent(draftId)}`)
    .then((res) => {
      if (cancelled || !res?.draft) return;
      setEditingDraftId(res.draft.id);
      setDraftTitle(res.draft.title ?? "");
      const matchedChannel = CHANNELS.find(
        (c) => c.id.toLowerCase() === (res.draft?.channel ?? "").toLowerCase()
      );
      if (matchedChannel) setChannel(matchedChannel.id);
      setText(res.draft.content ?? res.draft.text ?? "");
      setResult(null);
      setSavedDraftId(null);

      const changes = (res.history ?? []).filter(
        (h) => (h.action ?? "").toUpperCase() === "CHANGES_REQUESTED"
      );
      const latest = changes[changes.length - 1];
      if (latest) {
        setReviewerFeedback({
          actor: latest.actor_name ?? latest.actor ?? "Reviewer",
          note: (latest.details ?? latest.note ?? "Please address flagged findings.").trim(),
        });
      }
      setNotice("Editing existing draft. Fix the copy, run Check draft, and resubmit.");
    })
    .catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Could not load draft for editing.");
      }
    })
    .finally(() => {
      if (!cancelled) setLoadingEditDraft(false);
    });

  return () => {
    cancelled = true;
  };
}, []);

  function startExampleTypewriter() {
    stopTypewriter(false);
    if (!draftTitle.trim()) setDraftTitle("Winter Serum Launch");
    setSavedDraftId(null);
    setNotice(null);
    setError(null);
    setText("");

    let cursor = 0;
    typewriterRef.current = window.setInterval(() => {
      cursor += 3;
      if (cursor >= EXAMPLE.length) {
        setText(EXAMPLE);
        stopTypewriter(false);
      } else {
        setText(EXAMPLE.slice(0, cursor));
      }
    }, 12);
  }

  async function handleCheck() {
    const wasTypingExample = typewriterRef.current !== null;
    stopTypewriter(wasTypingExample);
    const activeText = wasTypingExample ? EXAMPLE : text;

    if (!activeText.trim()) {
      setError("Paste or type a draft first.");
      return;
    }
    setError(null);
    setNotice(null);
    setSavedDraftId(null);
    setHandedIds({});
    setOpenReportId(null);
    setMistakeStatus({});
    setActiveStep(0);
    setLoading(true);
    try {
      const data = await api<CheckResult>("/check", {
        method: "POST",
        body: { text: activeText },
      });
      setResult(data);
      setCheckedText(activeText);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    stopTypewriter(false);
    setDraftTitle("");
    setText("");
    setCheckedText("");
    setResult(null);
    setSavedDraftId(null);
    setUploadedImagePreview(null);
    setUploadedFileName(null);
    setVisualSummary(null);
    setError(null);
    setNotice(null);
    setOpenWhyId(null);
    setOpenReportId(null);
    setEditingDraftId(null);
setReviewerFeedback(null);
if (window.location.search.includes("draftId=")) {
  window.history.replaceState(null, "", "/dashboard/submit");
}
    setHandedIds({});
    setMistakeStatus({});
  }

  async function loadTextFile(file: File) {
    stopTypewriter(false);
    const allowedExt = /\.(txt|md|markdown|csv|tsv|json|html|htm|xml|yml|yaml|rtf|docx|pptx|pdf|png|jpe?g|webp|gif)$/i;
    const isPlainText =
      /\.(txt|md|markdown)$/i.test(file.name) ||
      file.type === "text/plain" ||
      file.type === "text/markdown";
    const isImage =
      /\.(png|jpe?g|webp|gif)$/i.test(file.name) || file.type.startsWith("image/");

    if (!allowedExt.test(file.name) && !isPlainText && !isImage) {
      setError(
        "Unsupported file type. Upload .txt, .md, .docx, .pptx, .pdf, or an ad image (.png, .jpg, .webp)."
      );
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setError("File is too large (max 3 MB). Please upload a smaller document or compressed image.");
      return;
    }

    setError(null);
    setNotice(null);
    setSavedDraftId(null);
    setHandedIds({});
    setOpenReportId(null);
    setMistakeStatus({});

    if (isPlainText) {
      const content = await file.text();
      if (!draftTitle.trim()) setDraftTitle(file.name);
      setUploadedImagePreview(null);
      setUploadedFileName(file.name);
      setVisualSummary(null);
      setText(content);
      setResult(null);
      setNotice(`Loaded "${file.name}". Click Check draft to scan it.`);
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read the selected file."));
      reader.readAsDataURL(file);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Could not read file.");
      return "";
    });

    if (!dataUrl) return;

    setUploadingFile(true);
    setActiveStep(0);
    setUploadedFileName(file.name);
    setUploadedImagePreview(isImage ? dataUrl : null);
    setVisualSummary(null);

    try {
      const res = await api<UploadResponse>("/upload", {
        method: "POST",
        body: {
          filename: file.name,
          file_base64: dataUrl,
          channel,
        },
      });
      const extracted = res.extracted_content ?? "";
      if (!draftTitle.trim()) setDraftTitle(file.name);
      setText(extracted);
      setCheckedText(extracted);
      setVisualSummary(res.visual_summary ?? null);
      if (res.check_result) {
        setResult(res.check_result);
      } else {
        setResult(null);
      }
      const visCount = res.visual_findings_count ?? 0;
      setNotice(
        isImage
          ? `Scanned "${file.name}" (${extracted.length} chars extracted${visCount > 0 ? `, ${visCount} visual/logo check${visCount === 1 ? "" : "s"}` : ""}).`
          : `Extracted & scanned "${file.name}" (${extracted.length} characters).`
      );
    } catch (err) {
      setResult(null);
      setError(
        err instanceof Error
          ? err.message
          : `Could not extract or check "${file.name}".`
      );
    } finally {
      setUploadingFile(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await loadTextFile(file);
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await loadTextFile(file);
    }
  }

  async function submitDraftToQueue(): Promise<{ id: string; findings: Finding[] } | null> {
    if (!result) return null;
    if (savedDraftId) {
      return { id: savedDraftId, findings: result.findings ?? [] };
    }
    setSubmittingDraft(true);
    setError(null);
    try {
      const fallbackTitle = `Draft (${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })})`;
      const endpoint = editingDraftId
        ? `/drafts/${encodeURIComponent(editingDraftId)}`
        : "/drafts";
      const res = await api<CreateDraftResponse>(endpoint, {
        method: editingDraftId ? "PATCH" : "POST",
        body: {
          title: draftTitle.trim() || fallbackTitle,
          channel,
          text,
          findings: result.findings ?? [],
          risk_level: result.risk_level ?? "LOW",
        },
      });
      const id = res.id ?? res.draft_id ?? editingDraftId;
      if (!id) throw new Error("Backend did not return a draft ID.");
      const dbFindings = Array.isArray(res.findings) ? res.findings : result.findings ?? [];
      setSavedDraftId(id);
      if (Array.isArray(res.findings)) {
        setResult((prev) => (prev ? { ...prev, findings: res.findings } : prev));
      }
      setNotice(
        editingDraftId
          ? "✓ Updated draft resubmitted to Review Queue!"
          : "✓ Draft submitted to Review Queue!"
      );
      return { id, findings: dbFindings };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit draft to review queue.");
      return null;
    } finally {
      setSubmittingDraft(false);
    }
  }

  async function handleHandover(f: Finding, idx: number) {
    setHandingId(f.id);
    setError(null);
    try {
      const saved = await submitDraftToQueue();
      if (!saved) return;
      const matchedFinding =
        saved.findings.find(
          (sf) => sf.id === f.id || (f.flagged_text && sf.flagged_text === f.flagged_text)
        ) ?? saved.findings[idx];
      await api(`/drafts/${saved.id}/handover`, {
        method: "POST",
        body: {
          finding_id: matchedFinding?.id ?? f.id,
          explanation: (whyNotes[f.id] ?? "").trim(),
        },
      });
      setHandedIds((prev) => ({ ...prev, [f.id]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not hand finding to manager.");
    } finally {
      setHandingId(null);
    }
  }

  function toggleReportDrawer(f: Finding) {
    if (openReportId === f.id) {
      setOpenReportId(null);
      return;
    }
    setOpenReportId(f.id);
    setMistakeForm({
      phrase: (f.flagged_text || f.reason || "").trim().slice(0, 120),
      region: "India",
      user_correction: "",
    });
  }

  async function submitAiMistake(f: Finding) {
    const phrase = mistakeForm.phrase.trim().slice(0, 120);
    const region = mistakeForm.region.trim().slice(0, 60);
    const incorrectFlag = (f.reason || f.type || "").trim().slice(0, 200);
    const userCorrection = mistakeForm.user_correction.trim().slice(0, 300);
    if (!phrase || !userCorrection) {
      setMistakeStatus((prev) => ({
        ...prev,
        [f.id]: "Please fill in both the phrase and your correction.",
      }));
      return;
    }
    setMistakeSavingId(f.id);
    try {
      const res = await api<{ mistake?: { updated_existing?: boolean } }>("/ai-mistakes", {
        method: "POST",
        body: {
          phrase,
          region,
          incorrect_flag: incorrectFlag,
          user_correction: userCorrection,
          flagged_text: phrase,
          team_region: region,
          reason: incorrectFlag,
          correction: userCorrection,
        },
      });
      const updated = res?.mistake?.updated_existing;
      setMistakeStatus((prev) => ({
        ...prev,
        [f.id]: updated
          ? "✓ Updated your earlier correction for this phrase."
          : "✓ Saved! Future AI checks will learn from this example.",
      }));
      setOpenReportId(null);
    } catch (err) {
      setMistakeStatus((prev) => ({
        ...prev,
        [f.id]: err instanceof Error ? err.message : "Could not save correction.",
      }));
    } finally {
      setMistakeSavingId(null);
    }
  }

  function applyFix(finding: Finding) {
    const flagged = finding.flagged_text;
    const fix = finding.suggested_fix;
    if (!flagged || !fix) return;

    const loose = flagged
      .trim()
      .split(/\s+/)
      .map((word) => escapeRegExp(word.replace(/s$/i, "")) + "s?")
      .join("\\s+");
    const match = new RegExp(loose, "i").exec(text);
    if (!match) {
      setNotice(`Couldn't find "${flagged}" in your draft. Please edit it by hand.`);
      return;
    }

    let start = match.index;
    const firstWord = fix.split(/\s+/)[0];
    const doubled = text
      .slice(0, start)
      .match(new RegExp(escapeRegExp(firstWord) + "\\s+$", "i"));
    if (doubled) start -= doubled[0].length;

    setText(text.slice(0, start) + fix + text.slice(match.index + match[0].length));
    setSavedDraftId(null);
    setNotice(
      "Your draft was updated with the suggested fix. Read the sentence and run Check draft again."
    );
  }

  const findings = [...(result?.findings ?? [])].sort(
    (a, b) => (severityRank[a.severity ?? ""] ?? 3) - (severityRank[b.severity ?? ""] ?? 3)
  );
  const risk = (result?.risk_level ?? "").toUpperCase();
  const outOfDate = result !== null && text !== checkedText;
  const busy = loading || uploadingFile;
  const pipelineStep = busy ? activeStep : result ? 3 : -1;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="relative mx-auto max-w-4xl">
      {/* Soft Ambient Spotlight Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -left-24 top-16 h-[420px] w-[420px] rounded-full bg-[#EFE5CE]/70 blur-3xl" />
        <div className="absolute right-[-6rem] top-28 h-[380px] w-[380px] rounded-full bg-[#58182E]/[0.07] blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[340px] w-[460px] rounded-full bg-[#DECDA9]/45 blur-3xl" />
      </div>

      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EDITORIAL_EASE }}
        >
          <h1 className="text-2xl font-semibold sm:text-4xl">Submit draft</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--tv-muted)] sm:text-base">
            Paste a draft to see what needs fixing before a reviewer looks at it. TrueVoice checks
            it against the approved library, shows the source for every finding, and leaves the
            decision to a person.
          </p>
        </motion.div>

  {/* Live 3-Step Check Radar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease: EDITORIAL_EASE }}
          className="grid gap-2 rounded-2xl border border-[var(--tv-champagne)] bg-white/90 p-3 shadow-xs backdrop-blur-xs sm:grid-cols-3"
        >
          {CHECK_STEPS.map((label, idx) => {
            const done = pipelineStep > idx;
            const current = pipelineStep === idx;
            return (
              <div
                key={label}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-300 ${
                  done
                    ? "bg-[#ddebdd] text-[#1f6b3a]"
                    : current
                      ? "bg-[var(--tv-brand)] text-white shadow-sm"
                      : "bg-[var(--tv-paper)] text-[var(--tv-muted)]"
                }`}
              >
                {done ? (
                  <motion.span
                    initial={{ scale: 0.7 }}
                    animate={{ scale: 1 }}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1f6b3a] text-[10px] text-white"
                  >
                    <Check className="h-2.5 w-2.5" />
                  </motion.span>
                ) : (
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    {current && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--tv-champagne)] opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                        current ? "bg-[var(--tv-champagne)]" : "bg-[var(--tv-edge)]/40"
                      }`}
                    />
                  </span>
                )}
                <span>{label}</span>
              </div>
            );
          })}
        </motion.div>

        {/* Reviewer Feedback Banner when editing an existing draft */}
        {(loadingEditDraft || editingDraftId) && (
          <div className="rounded-2xl border border-[#7a4b00]/30 bg-[#f6e7c8]/70 p-4 text-xs text-[#7a4b00]">
            {loadingEditDraft ? (
              <span>Loading draft for editing…</span>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="inline-flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Editing existing draft (will update in place—no duplicate created)
                  </p>
                  {reviewerFeedback && (
                    <p>
                      <strong>{reviewerFeedback.actor} requested changes:</strong>{" "}
                      {reviewerFeedback.note}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#7a4b00]/30 bg-white px-2.5 py-1 font-semibold text-[#7a4b00] hover:bg-[#fbf7f0]"
                >
                  <RotateCcw className="h-3 w-3" />
                  New draft instead
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tactile Stationery Sheet + Magnetic Dropzone */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, scale: isDragging ? 1.01 : 1 }}
          transition={{ duration: 0.45, delay: 0.1, ease: EDITORIAL_EASE }}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative overflow-hidden rounded-3xl border bg-white/95 shadow-[0_20px_50px_-26px_rgba(88,24,46,0.22)] backdrop-blur-xs transition-colors duration-200 ${
            isDragging
              ? "border-2 border-dashed border-[var(--tv-brand)] ring-4 ring-[var(--tv-champagne)]/60"
              : "border-[var(--tv-champagne)]"
          }`}
        >
          {/* Magnetic Drop Overlay */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#FAF6EE]/92 backdrop-blur-xs"
              >
                <motion.div
                  initial={{ scale: 0.85, y: 6 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 360, damping: 24 }}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--tv-champagne)] bg-white px-7 py-5 shadow-md"
                >
                  <Upload className="h-7 w-7 text-[var(--tv-brand)]" />
                  <p className="font-serif text-lg font-semibold text-[var(--tv-brand)]">
                    Drop your draft, PDF, or ad image here
                  </p>
                  <p className="text-xs text-[var(--tv-muted)]">
                    Release to scan copy or ad creative (max 3 MB)
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Top Stationery Header Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--tv-line)] bg-gradient-to-r from-[#fbf7f0] to-white px-5 py-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[var(--tv-brand)]">
              <FileText className="h-3.5 w-3.5" />
              Editorial Draft Sheet
            </span>
            <div className="flex items-center gap-3 text-[var(--tv-muted)] tabular-nums">
              <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
              <span>&middot;</span>
              <span>{text.length} chars</span>
            </div>
          </div>

          {/* Sheet Body */}
          <div className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-5 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <label htmlFor="draft-title" className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                  Draft title
                </label>
                <input
                  id="draft-title"
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="e.g. Winter Serum Launch Post"
                  className="mt-1.5 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/55 px-3.5 py-2.5 text-sm outline-none transition focus:border-[var(--tv-brand)] focus:bg-white"
                />
              </div>

              <div className="lg:col-span-7">
                <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                  Channel
                </span>
                <div
                  role="radiogroup"
                  aria-label="Channel"
                  className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/70 p-1 sm:flex sm:flex-wrap"
                >
                  {CHANNELS.map((c) => {
                    const Icon = c.icon;
                    const active = channel === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setChannel(c.id)}
                        className={`relative flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition-colors sm:flex-1 ${
                          active
                            ? "text-white"
                            : "text-[var(--tv-muted)] hover:text-[var(--tv-ink)]"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="submit-channel-pill"
                            transition={{ type: "spring", stiffness: 400, damping: 32 }}
                            className="absolute inset-0 rounded-lg bg-[var(--tv-brand)] shadow-xs"
                          />
                        )}
                        <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" />
                        <span className="relative z-10">{c.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="draft"
                  className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]"
                >
                  Your draft
                </label>
                <span className="text-[11px] text-[var(--tv-muted)]">
                  Drag &amp; drop a .txt, .md, .pdf, .docx, or ad image anywhere on this sheet
                </span>
              </div>

              <div className="relative mt-2 overflow-hidden rounded-2xl border border-[var(--tv-line)] bg-[#FAF6EE]/55 transition focus-within:border-[var(--tv-brand)] focus-within:bg-white focus-within:ring-2 focus-within:ring-[var(--tv-brand)]/15">
                <AnimatePresence>
                  {busy && (
                    <motion.div
                      key="sheet-scanner"
                      aria-hidden="true"
                      initial={{ x: "-100%", opacity: 0 }}
                      animate={{ x: "260%", opacity: [0, 1, 1, 0] }}
                      exit={{ opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 1.25, ease: "easeInOut" }}
                      className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[var(--tv-champagne)]/55 to-transparent"
                    />
                  )}
                </AnimatePresence>
                <textarea
                  id="draft"
                  rows={8}
                  value={text}
                  onChange={(e) => {
                    stopTypewriter(false);
                    setText(e.target.value);
                  }}
                  placeholder="Paste your post, ad copy, or email draft here..."
                  className="block w-full resize-y bg-transparent p-4 text-sm leading-relaxed outline-none sm:p-5 sm:text-base"
                />
              </div>
            </div>
          </div>

          {/* Floating Bottom Action Dock */}
          <div className="flex flex-col gap-3 border-t border-[var(--tv-line)] bg-[#fbf7f0]/90 px-5 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <motion.button
                type="button"
                whileHover={!busy ? { y: -1 } : undefined}
                whileTap={!busy ? { scale: 0.97 } : undefined}
                onClick={handleCheck}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--tv-brand)] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--tv-brand-ink)] disabled:opacity-60 sm:w-auto"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>{loading ? "Checking draft…" : "Check draft"}</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={!busy ? { scale: 0.97 } : undefined}
                disabled={busy}
                onClick={() => {
                  setUploadedImagePreview(null);
                  setUploadedFileName(null);
                  setVisualSummary(null);
                  startExampleTypewriter();
                }}
                className="w-full rounded-xl border border-[var(--tv-champagne)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--tv-ink)] transition hover:bg-[var(--tv-paper)] disabled:opacity-60 sm:w-auto"
              >
                Use example draft
              </motion.button>

              <label className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[var(--tv-champagne)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--tv-ink)] transition hover:bg-[var(--tv-paper)] active:scale-95 sm:w-auto">
                {uploadingFile ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--tv-brand)]" />
                ) : (
                  <Upload className="h-3.5 w-3.5 text-[var(--tv-brand)]" />
                )}
                <span>{uploadingFile ? "Scanning file…" : "Upload file / ad image"}</span>
                <input
                  type="file"
                  disabled={busy}
                  accept=".txt,.md,.csv,.json,.html,.rtf,.docx,.pptx,.pdf,.png,.jpg,.jpeg,.webp,.gif"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
            </div>

            <motion.button
              type="button"
              whileTap={!busy ? { scale: 0.97 } : undefined}
              disabled={busy}
              onClick={handleClear}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--tv-line)] bg-white/70 px-4 py-2.5 text-sm font-medium text-[var(--tv-muted)] transition hover:bg-white hover:text-[var(--tv-ink)] disabled:opacity-60 sm:w-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear</span>
            </motion.button>
          </div>
        </motion.div>
        <p className="text-xs text-[var(--tv-muted)]">
          Supported formats: pasted text, <code>.txt</code>, <code>.md</code>, <code>.docx</code>,{" "}
          <code>.pptx</code>, <code>.pdf</code>, and ad images (<code>.png</code>, <code>.jpg</code>,{" "}
          <code>.webp</code>) with visual &amp; logo checks (max 3 MB).
        </p>

        <AnimatePresence>
          {(uploadedImagePreview || visualSummary) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex flex-col gap-4 rounded-2xl border border-[var(--tv-champagne)] bg-white/95 p-4 shadow-xs sm:flex-row sm:items-center"
            >
              {uploadedImagePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={uploadedImagePreview}
                  alt={uploadedFileName ?? "Uploaded ad creative"}
                  className="h-28 w-full shrink-0 rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)] object-contain sm:w-36"
                />
              )}
              <div className="min-w-0 space-y-1 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-brand)]">
                  Visual &amp; Logo Inspection {uploadedFileName ? `· ${uploadedFileName}` : ""}
                </p>
                <p className="text-[var(--tv-ink)]">
                  {visualSummary ||
                    "Image text extracted and checked against Glowvale brand guidelines, seals, and logo rules."}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="rounded-xl border border-[#f2c4be] bg-[#f9ddd9]/55 px-4 py-2.5 text-sm font-medium text-[var(--tv-flag)]"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {notice && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1f6b3a]/30 bg-[#ddebdd]/60 p-3.5 text-sm font-medium text-[#1f6b3a]"
            >
              <span>&#10003; {notice}</span>
              {savedDraftId && (
                <Link
                  href={`/dashboard/review?draftId=${encodeURIComponent(savedDraftId)}`}
                  className="inline-flex items-center gap-1 font-semibold underline"
                >
                  Open in Review queue
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {result && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: EDITORIAL_EASE }}
              className="space-y-6 pt-2"
              aria-label="Check results"
            >
              {/* Overall Risk Summary + Submit for Human Review */}
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[var(--tv-champagne)] bg-white/95 p-4 shadow-sm backdrop-blur-xs sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                      Overall risk
                    </p>
                    <span
                      className={`mt-1 inline-flex items-center gap-2 rounded-full px-4 py-1 text-base font-semibold sm:text-lg ${
                        severityStyle[risk] ?? "bg-[var(--tv-paper)]"
                      }`}
                    >
                      {risk === "HIGH" && (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#9b1c13] opacity-75" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#9b1c13]" />
                        </span>
                      )}
                      {severityLabel[risk] ?? (risk || "Unknown")}
                    </span>
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold">
                      {result.findings_count ?? findings.length}{" "}
                      {(result.findings_count ?? findings.length) === 1 ? "finding" : "findings"}
                    </p>
                    {result.summary && (
                      <p className="text-[var(--tv-muted)]">
                        {result.summary.high_severity_count ?? 0} high,{" "}
                        {result.summary.medium_severity_count ?? 0} medium,{" "}
                        {result.summary.low_severity_count ?? 0} low
                        {(result.summary.unverified_count ?? 0) > 0 &&
                          `, ${result.summary.unverified_count} unverified`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex w-full items-center gap-3 sm:w-auto">
                  <span className="hidden text-xs text-[var(--tv-muted)] sm:inline">
                    &#10022; Human decides
                  </span>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    disabled={submittingDraft || Boolean(savedDraftId) || outOfDate}
                    onClick={submitDraftToQueue}
                    className="w-full rounded-xl bg-[var(--tv-brand)] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] disabled:opacity-60 sm:w-auto sm:py-2"
                  >
                    {savedDraftId
                      ? "✓ Submitted to Queue"
                      : submittingDraft
                        ? "Submitting…"
                        : "Submit for human review"}
                  </motion.button>
                </div>
              </div>

              {outOfDate && (
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-[#7a4b00]">
                  Your draft has changed since this check. Run <strong>Check draft</strong> again
                  for fresh results before submitting.
                </p>
              )}

              {findings.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--tv-edge)] bg-white p-5">
                  No findings. Nothing in the approved library conflicts with this draft. A person
                  still makes the final decision.
                </p>
              ) : (
                <ol className="space-y-4">
                  {findings.map((f, idx) => {
                    const sev = (f.severity ?? "").toUpperCase();
                    const confidence =
                      typeof f.confidence === "number"
                        ? Math.round(f.confidence <= 1 ? f.confidence * 100 : f.confidence)
                        : null;
                    const whyOpen = openWhyId === f.id;
                    const handed = Boolean(handedIds[f.id]);

                    return (
                      <motion.li
                        key={f.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.35,
                          delay: idx * 0.06,
                          ease: EDITORIAL_EASE,
                        }}
                        className="rounded-2xl border border-[var(--tv-line)] bg-white/95 p-4 shadow-sm transition hover:shadow-md sm:p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                                severityStyle[sev] ?? "bg-[var(--tv-paper)]"
                              }`}
                            >
                              {severityLabel[sev] ?? "Finding"}
                            </span>
                            <span className="font-semibold">{typeLabel(f.type)}</span>
                          </div>

                          {canReportMistake && (
                            <button
                              type="button"
                              onClick={() => toggleReportDrawer(f)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                                openReportId === f.id || mistakeStatus[f.id]?.startsWith("✓")
                                  ? "border-[var(--tv-brand)] bg-[var(--tv-paper)] text-[var(--tv-brand)]"
                                  : "border-[var(--tv-line)] text-[var(--tv-muted)] hover:bg-[var(--tv-paper)]"
                              }`}
                            >
                              <Flag className="h-3 w-3" />
                              {mistakeStatus[f.id]?.startsWith("✓")
                                ? "AI mistake reported"
                                : "Report AI Mistake"}
                            </button>
                          )}
                        </div>

                        {mistakeStatus[f.id] && (
                          <p
                            role="status"
                            className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
                              mistakeStatus[f.id].startsWith("✓")
                                ? "bg-[#ddebdd] text-[#1f6b3a]"
                                : "bg-[#f9ddd9] text-[#9b1c13]"
                            }`}
                          >
                            {mistakeStatus[f.id]}
                          </p>
                        )}

                        {/* Report AI Mistake Inline Drawer (Reviewer/Admin) */}
                        <AnimatePresence initial={false}>
                          {openReportId === f.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: EDITORIAL_EASE }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 space-y-2.5 rounded-xl border border-[var(--tv-champagne)] bg-[var(--tv-paper)] p-3.5 text-xs">
                                <p className="font-semibold text-[var(--tv-ink)]">
                                  Correct the AI for future checks (saved as an example, no
                                  retraining):
                                </p>
                                <p className="text-[11px] text-[var(--tv-muted)]">
                                  Note: Only affects AI &amp; regional-nuance checks. Exact company
                                  rules (like expired offers or prices) stay enforced.
                                </p>
                                <div className="grid gap-2 sm:grid-cols-3">
                                  <div className="sm:col-span-2">
                                    <label className="block font-medium text-[var(--tv-muted)]">
                                      Phrase (required, max 120)
                                    </label>
                                    <input
                                      type="text"
                                      maxLength={120}
                                      value={mistakeForm.phrase}
                                      onChange={(e) =>
                                        setMistakeForm((p) => ({ ...p, phrase: e.target.value }))
                                      }
                                      className="mt-1 w-full rounded-lg border border-[var(--tv-line)] bg-white px-2.5 py-1.5 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block font-medium text-[var(--tv-muted)]">
                                      Region (max 60)
                                    </label>
                                    <input
                                      type="text"
                                      maxLength={60}
                                      value={mistakeForm.region}
                                      onChange={(e) =>
                                        setMistakeForm((p) => ({ ...p, region: e.target.value }))
                                      }
                                      className="mt-1 w-full rounded-lg border border-[var(--tv-line)] bg-white px-2.5 py-1.5 text-xs"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block font-medium text-[var(--tv-muted)]">
                                    Your correction / why it&rsquo;s okay (required, max 300)
                                  </label>
                                  <textarea
                                    rows={2}
                                    maxLength={300}
                                    value={mistakeForm.user_correction}
                                    onChange={(e) =>
                                      setMistakeForm((p) => ({
                                        ...p,
                                        user_correction: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. Acceptable regional slang / benign campaign phrasing."
                                    className="mt-1 w-full rounded-lg border border-[var(--tv-line)] bg-white p-2 text-xs"
                                  />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={mistakeSavingId === f.id}
                                    onClick={() => submitAiMistake(f)}
                                    className="w-full rounded-lg bg-[var(--tv-brand)] px-3 py-1.5 font-semibold text-white hover:bg-[var(--tv-brand-ink)] disabled:opacity-60 sm:w-auto"
                                  >
                                    {mistakeSavingId === f.id ? "Saving…" : "Save correction"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setOpenReportId(null)}
                                    className="w-full rounded-lg border border-[var(--tv-line)] bg-white px-3 py-1.5 sm:w-auto"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {f.flagged_text && (
                          <p className="mt-3 break-words text-sm">
                            Flagged wording:{" "}
                            <mark className="rounded bg-[#f9ddd9] px-1.5 py-0.5 font-medium text-[#9b1c13]">
                              {f.flagged_text}
                            </mark>
                          </p>
                        )}

                        <p className="mt-2 text-sm">{f.reason}</p>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--tv-paper)] px-3.5 py-2.5 text-xs text-[var(--tv-muted)]">
                          <span>
                            {f.rule_ref && <>Rule {f.rule_ref}</>}
                            {f.rule_ref && f.source_id && <> &middot; </>}
                            {f.source_id ? (
                              <strong className="text-[var(--tv-ink)]">Source {f.source_id}</strong>
                            ) : (
                              <strong className="text-[#7a4b00]">Unverified, needs source</strong>
                            )}
                          </span>

                          {confidence !== null && (
                            <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
                              <span>Confidence {confidence}%</span>
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${confidence}%` }}
                                  transition={{ duration: 0.7, ease: EDITORIAL_EASE }}
                                  className={`h-full rounded-full ${
                                    severityBarColor[sev] ?? "bg-[var(--tv-brand)]"
                                  }`}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {f.suggested_fix && (
                          <div className="mt-4 flex flex-col items-stretch gap-3 rounded-xl border border-[#1f6b3a]/20 bg-[#ddebdd]/40 p-3 sm:flex-row sm:items-center">
                            <p className="min-w-0 flex-1 break-words text-sm">
                              <span className="font-semibold text-[#1f6b3a]">Suggested fix:</span>{" "}
                              {f.suggested_fix}
                            </p>
                            {needsPerson(f.type) ? (
                              <span className="text-xs font-semibold text-[#7a4b00]">
                                Needs a person: check the schedule
                              </span>
                            ) : (
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.96 }}
                                onClick={() => applyFix(f)}
                                className="w-full shrink-0 rounded-lg bg-[var(--tv-brand)] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] sm:w-auto sm:py-1.5"
                              >
                                Use this fix
                              </motion.button>
                            )}
                          </div>
                        )}

                        {/* One-Chance "Why flagged?" -> Hand to Manager */}
                        <div className="mt-3 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => setOpenWhyId(whyOpen ? null : f.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--tv-brand)] underline"
                          >
                            <span>
                              {whyOpen ? "Hide context" : "Why flagged? (1-chance context)"}
                            </span>
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                                whyOpen ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </div>

                        <AnimatePresence initial={false}>
                          {whyOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: EDITORIAL_EASE }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)] p-3 text-xs">
                                {!handed ? (
                                  <>
                                    <p className="font-semibold text-[var(--tv-ink)]">
                                      Give one quick explanation (e.g. a campaign pun), or pass to a
                                      human manager:
                                    </p>
                                    <textarea
                                      rows={2}
                                      value={whyNotes[f.id] ?? ""}
                                      onChange={(e) =>
                                        setWhyNotes((prev) => ({
                                          ...prev,
                                          [f.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="Add context for your reviewer..."
                                      className="mt-2 w-full rounded-lg border border-[var(--tv-line)] bg-white p-2 text-xs"
                                    />
                                    <button
                                      type="button"
                                      disabled={handingId === f.id}
                                      onClick={() => handleHandover(f, idx)}
                                      className="mt-2 w-full rounded-lg bg-[#7a4b00] px-3 py-1.5 font-semibold text-white transition hover:bg-[#5e3a00] active:scale-95 disabled:opacity-60 sm:w-auto"
                                    >
                                      {handingId === f.id
                                        ? "Sending to manager…"
                                        : "Hand to Manager"}
                                    </button>
                                  </>
                                ) : (
                                  <p className="font-semibold text-[#1f6b3a]">
                                    &#10003; Handed to human manager and saved to Review Queue.
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.li>
                    );
                  })}
                </ol>
              )}

              <p className="text-sm text-[var(--tv-muted)]">
                TrueVoice only checks against the approved library. No finding does not mean a
                draft is correct, and nothing is published without a person&rsquo;s decision.
              </p>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}