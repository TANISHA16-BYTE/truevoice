"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  BookOpen,
  Check,
  ChevronRight,
  Edit3,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/SessionContext";

type Item = Record<string, unknown>;
type CrudKind = "facts" | "prices" | "offers" | "claims" | "terms";

type ImportedCandidate = {
  id: string;
  kind: CrudKind;
  title: string;
  payload: Record<string, unknown>;
  checked: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  saveError?: string;
};

type ImportResponse = {
  filename?: string;
  file_type?: string;
  extraction_mode?: string;
  summary?: string;
  extracted_count?: number;
  items?: Array<{
    id?: string;
    kind: CrudKind;
    title?: string;
    payload?: Record<string, unknown>;
  }>;
};

const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const;

const tabs = [
  { key: "facts", singular: "Fact", label: "Facts", help: "Approved product facts." },
  { key: "prices", singular: "Price", label: "Prices", help: "Current and outdated prices." },
  { key: "offers", singular: "Offer", label: "Offers", help: "Active and expired promotions." },
  { key: "claims", singular: "Claim", label: "Claims", help: "Approved, restricted and prohibited claims." },
  { key: "terms", singular: "Term", label: "Terms", help: "Banned and retired wording." },
  { key: "rules", singular: "Rule", label: "Rules", help: "Brand guideline rules." },
  { key: "sources", singular: "Source", label: "Sources", help: "Where each fact comes from, and when it was last checked." },
];

const CRUD_TABS = new Set<string>(["facts", "prices", "offers", "claims", "terms"]);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextMonthIso(): string {
  return new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
}

function isItem(value: unknown): value is Item {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toList(data: unknown): Item[] {
  if (Array.isArray(data)) return data.filter(isItem);
  if (isItem(data)) {
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) return value.filter(isItem);
    }
  }
  return [];
}

function itemIdOf(item: Item, tab: string): string {
  const keysByTab: Record<string, string[]> = {
    facts: ["fact_id", "id"],
    prices: ["price_id", "id"],
    offers: ["offer_id", "id"],
    claims: ["claim_id", "id"],
    terms: ["term_id", "id"],
    rules: ["rule_id", "id"],
    sources: ["source_id", "id"],
  };
  for (const key of keysByTab[tab] ?? ["id"]) {
    const val = item[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function formatValue(value: unknown, key = ""): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number" && key.endsWith("_inr")) {
    return `₹${value.toLocaleString("en-IN")}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(parsed);
    }
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function titleOf(item: Item): { keys: string[]; text: string } {
  if (typeof item.fact_key === "string" && item.fact_value !== undefined) {
    return {
      keys: ["fact_key", "fact_value"],
      text: `${item.fact_key.replace(/_/g, " ")}: ${formatValue(item.fact_value)}`,
    };
  }

  const texts = Object.entries(item).filter(([, v]) => typeof v === "string" && v !== "");
  const isCodeOrDate = (k: string) => /(^|_)id$|code|date/.test(k);
  const pick = (pattern: RegExp) => texts.find(([k]) => pattern.test(k) && !isCodeOrDate(k));
  const found =
    pick(/name|title|text|description|claim|term|rule/) ??
    pick(/value|label|key/) ??
    texts.find(([k]) => /id$/.test(k));

  if (found) return { keys: [found[0]], text: String(found[1]) };
  return { keys: [], text: "(untitled)" };
}

function needsRecheck(item: Item): boolean {
  const words = /stale|expired|outdated|overdue/i;
  return Object.entries(item).some(([key, value]) => {
    if (typeof value === "boolean") return value && words.test(key);
    if (typeof value === "string" && /^(status|state|freshness)$/i.test(key)) return words.test(value);
    return false;
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const regex = new RegExp(`(${escapeRegExp(q)})`, "ig");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="rounded-xs bg-[#EFE5CE] px-0.5 font-semibold text-[var(--tv-brand)]"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function emptyFormFor(kind: CrudKind, defaultSource = "S-01", defaultRule = "Tone 1.1"): Record<string, string> {
  switch (kind) {
    case "facts":
      return {
        product_code: "GV-SER-30",
        fact_key: "",
        fact_value: "",
        source_id: defaultSource,
      };
    case "prices":
      return {
        product_code: "",
        product_name: "",
        current_price_inr: "",
        old_price_inr: "",
        effective_date: todayIso(),
        source_id: defaultSource,
      };
    case "offers":
      return {
        code: "",
        title: "",
        discount_pct: "10",
        applies_to: "ALL",
        valid_from: todayIso(),
        valid_to: nextMonthIso(),
        max_discount_inr: "",
        status: "active",
      };
    case "claims":
      return {
        claim_text: "",
        status: "approved",
        applies_to: "ALL",
        required_evidence: "",
        source_id: defaultSource,
        rule_ref: defaultRule,
        safe_alternative: "(use as is)",
      };
    case "terms":
      return {
        term: "",
        category: "banned",
        replacement: "",
        reason: "",
        rule_ref: defaultRule,
      };
  }
}

function formFromItem(kind: CrudKind, item: Item): Record<string, string> {
  const base = emptyFormFor(kind);
  for (const key of Object.keys(base)) {
    const val = item[key];
    base[key] = val === null || val === undefined ? "" : String(val);
  }
  return base;
}

function payloadFromForm(kind: CrudKind, form: Record<string, string>): Record<string, unknown> {
  const str = (k: string) => (form[k] ?? "").trim();
  const intOrNull = (k: string) => {
    const raw = str(k);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n) : raw;
  };

  switch (kind) {
    case "facts":
      return {
        product_code: str("product_code"),
        fact_key: str("fact_key"),
        fact_value: str("fact_value"),
        source_id: str("source_id"),
      };
    case "prices":
      return {
        product_code: str("product_code"),
        product_name: str("product_name"),
        current_price_inr: intOrNull("current_price_inr"),
        old_price_inr: intOrNull("old_price_inr"),
        effective_date: str("effective_date") || todayIso(),
        source_id: str("source_id"),
      };
    case "offers":
      return {
        code: str("code").toUpperCase(),
        title: str("title"),
        discount_pct: intOrNull("discount_pct") ?? 0,
        applies_to: str("applies_to") || "ALL",
        valid_from: str("valid_from"),
        valid_to: str("valid_to"),
        max_discount_inr: intOrNull("max_discount_inr"),
        status: str("status") === "expired" ? "expired" : "active",
      };
    case "claims":
      return {
        claim_text: str("claim_text"),
        status: str("status") || "restricted",
        applies_to: str("applies_to") || "ALL",
        required_evidence: str("required_evidence"),
        source_id: str("source_id"),
        rule_ref: str("rule_ref"),
        safe_alternative: str("safe_alternative"),
      };
    case "terms":
      return {
        term: str("term"),
        category: str("category") === "retired" ? "retired" : "banned",
        replacement: str("replacement"),
        reason: str("reason"),
        rule_ref: str("rule_ref"),
      };
  }
}

type Result = { tab: string; items: Item[]; error: string | null };

export default function LibraryPage() {
  const { user } = useSession();
  const canEdit = user?.role === "reviewer" || user?.role === "admin";

  const [tab, setTab] = useState("facts");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);

  const [sourcesList, setSourcesList] = useState<Item[]>([]);
  const [rulesList, setRulesList] = useState<Item[]>([]);

  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editorMode, setEditorMode] = useState<"closed" | "add" | "edit">("closed");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, string>>({});
  const [savingItem, setSavingItem] = useState(false);

  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState({ title: "", text: "" });
  const [savingPatchId, setSavingPatchId] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importFilename, setImportFilename] = useState<string | null>(null);
  const [importItems, setImportItems] = useState<ImportedCandidate[]>([]);
  const [savingChecklist, setSavingChecklist] = useState(false);

  const loadMetaOptions = useCallback(async () => {
    try {
      const [srcData, ruleData] = await Promise.all([
        api<unknown>("/library/sources"),
        api<unknown>("/library/rules"),
      ]);
      setSourcesList(toList(srcData));
      setRulesList(toList(ruleData));
    } catch {
      /* fallback to text input if metadata unavailable */
    }
  }, []);

  useEffect(() => {
    loadMetaOptions();
  }, [loadMetaOptions]);

  useEffect(() => {
    let cancelled = false;
    api<unknown>(`/library/${tab}`)
      .then((data) => {
        if (!cancelled) {
          setResult({ tab, items: toList(data), error: null });
          setSelectedIdx(0);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({
            tab,
            items: [],
            error: err instanceof Error ? err.message : "Could not load this list.",
          });
          setSelectedIdx(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, reloadTick]);

  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const loading = result?.tab !== tab;
  const items = loading || !result ? [] : result.items;
  const shown = items.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
  );

  const safeIdx = shown.length > 0 ? Math.min(selectedIdx, shown.length - 1) : 0;
  const selectedItem = shown[safeIdx] ?? null;

  const defaultSourceId = String(sourcesList[0]?.source_id ?? "S-01");
  const defaultRuleId = String(rulesList[0]?.rule_id ?? "Tone 1.1");

  function openAddDrawer() {
    if (!CRUD_TABS.has(tab)) return;
    setActionError(null);
    setActionNotice(null);
    setEditingId(null);
    setFormState(emptyFormFor(tab as CrudKind, defaultSourceId, defaultRuleId));
    setEditorMode("add");
  }

  function openEditDrawer(item: Item) {
    if (!CRUD_TABS.has(tab)) return;
    const id = itemIdOf(item, tab);
    if (!id) return;
    setActionError(null);
    setActionNotice(null);
    setEditingId(id);
    setFormState(formFromItem(tab as CrudKind, item));
    setEditorMode("edit");
  }

  async function handleSaveCrud(e: React.FormEvent) {
    e.preventDefault();
    if (!CRUD_TABS.has(tab)) return;
    const kind = tab as CrudKind;
    setSavingItem(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const payload = payloadFromForm(kind, formState);
      if (editorMode === "add") {
        await api(`/library/${kind}`, { method: "POST", body: payload });
        setActionNotice(`Added new ${current.singular.toLowerCase()} to the approved library.`);
      } else if (editorMode === "edit" && editingId) {
        await api(`/library/${kind}/${encodeURIComponent(editingId)}`, {
          method: "PUT",
          body: payload,
        });
        setActionNotice(`Updated ${editingId} in the approved library.`);
      }
      setEditorMode("closed");
      setEditingId(null);
      setReloadTick((n) => n + 1);
      loadMetaOptions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save item.");
    } finally {
      setSavingItem(false);
    }
  }

  async function handleArchiveItem(id: string) {
    if (!CRUD_TABS.has(tab) || !id) return;
    setArchivingId(id);
    setActionError(null);
    setActionNotice(null);
    try {
      await api(`/library/${tab}/${encodeURIComponent(id)}`, { method: "DELETE" });
      setConfirmArchiveId(null);
      setActionNotice(`Archived ${id}. Draft checks will no longer treat it as active.`);
      setReloadTick((n) => n + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Could not archive ${id}.`);
    } finally {
      setArchivingId(null);
    }
  }

  async function handleMarkVerifiedToday(sourceId: string) {
    if (!sourceId) return;
    setSavingPatchId(sourceId);
    setActionError(null);
    setActionNotice(null);
    try {
      await api(`/library/${encodeURIComponent(sourceId)}`, {
        method: "PATCH",
        body: { last_checked_at: todayIso() },
      });
      setActionNotice(`Marked ${sourceId} verified today (${todayIso()}).`);
      setReloadTick((n) => n + 1);
      loadMetaOptions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Could not verify ${sourceId}.`);
    } finally {
      setSavingPatchId(null);
    }
  }

  async function handleSaveRuleWording(ruleId: string) {
    if (!ruleId) return;
    setSavingPatchId(ruleId);
    setActionError(null);
    setActionNotice(null);
    try {
      await api(`/library/${encodeURIComponent(ruleId)}`, {
        method: "PATCH",
        body: {
          title: ruleDraft.title.trim(),
          text: ruleDraft.text.trim(),
        },
      });
      setEditingRuleId(null);
      setActionNotice(`Updated rule wording for ${ruleId}.`);
      setReloadTick((n) => n + 1);
      loadMetaOptions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Could not update rule ${ruleId}.`);
    } finally {
      setSavingPatchId(null);
    }
  }

  async function handleBrandGuideFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!/\.(pdf|docx|pptx|rtf|txt|md)$/i.test(file.name)) {
      setActionError("Upload a .pdf, .docx, .pptx, .rtf, .txt, or .md brand guide.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setActionError("Brand guide is too large (max 3 MB). Upload a shorter 1–5 page PDF or DOCX.");
      return;
    }

    setImportingFile(true);
    setActionError(null);
    setActionNotice(null);
    setImportSummary(null);
    setImportFilename(file.name);
    setImportItems([]);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });

      const res = await api<ImportResponse>("/library/import-pdf", {
        method: "POST",
        body: {
          filename: file.name,
          file_base64: dataUrl,
        },
      });

      const candidates: ImportedCandidate[] = (res.items ?? []).map((item, idx) => ({
        id: item.id || `imp_${idx}`,
        kind: item.kind,
        title: item.title || `${item.kind} item`,
        payload: { ...(item.payload ?? {}) },
        checked: true,
        saveState: "idle",
      }));

      setImportSummary(
        res.summary ||
          `Extracted ${candidates.length} item${candidates.length === 1 ? "" : "s"} from "${file.name}".`
      );
      setImportItems(candidates);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Could not extract items from "${file.name}".`
      );
    } finally {
      setImportingFile(false);
    }
  }

  function updateCandidatePayload(candidateId: string, field: string, value: unknown) {
    setImportItems((prev) =>
      prev.map((item) =>
        item.id === candidateId
          ? {
              ...item,
              saveState: item.saveState === "error" ? "idle" : item.saveState,
              saveError: undefined,
              payload: { ...item.payload, [field]: value },
            }
          : item
      )
    );
  }

  async function saveSingleCandidate(candidate: ImportedCandidate): Promise<boolean> {
    setImportItems((prev) =>
      prev.map((c) => (c.id === candidate.id ? { ...c, saveState: "saving", saveError: undefined } : c))
    );
    try {
      await api(`/library/${candidate.kind}`, {
        method: "POST",
        body: candidate.payload,
      });
      setImportItems((prev) =>
        prev.map((c) => (c.id === candidate.id ? { ...c, saveState: "saved" } : c))
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save item.";
      setImportItems((prev) =>
        prev.map((c) =>
          c.id === candidate.id ? { ...c, saveState: "error", saveError: msg } : c
        )
      );
      return false;
    }
  }

  async function handleApproveSelectedImport() {
    const targets = importItems.filter((c) => c.checked && c.saveState !== "saved");
    if (targets.length === 0) return;

    setSavingChecklist(true);
    setActionError(null);
    let savedCount = 0;
    for (const item of targets) {
      const ok = await saveSingleCandidate(item);
      if (ok) savedCount += 1;
    }
    setSavingChecklist(false);

    if (savedCount > 0) {
      setActionNotice(
        `Saved ${savedCount} approved item${savedCount === 1 ? "" : "s"} from "${importFilename ?? "brand guide"}" into the live library.`
      );
      setReloadTick((n) => n + 1);
      loadMetaOptions();
    }
  }

  const selectedPendingCount = importItems.filter(
    (c) => c.checked && c.saveState !== "saved"
  ).length;

  return (
    <div className="mx-auto max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EDITORIAL_EASE }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold sm:text-4xl">Library</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--tv-muted)] sm:text-base">
            The approved facts, prices, offers and rules that every draft is checked against.
          </p>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2.5">
            {CRUD_TABS.has(tab) && (
              <button
                type="button"
                onClick={openAddDrawer}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--tv-brand)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[var(--tv-brand-ink)] active:scale-95 sm:text-sm"
              >
                <Plus className="h-4 w-4" />
                Add {current.singular}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setImportOpen((v) => !v);
                setActionError(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition active:scale-95 sm:text-sm ${
                importOpen
                  ? "border-[var(--tv-brand)] bg-[#fbf7f0] text-[var(--tv-brand)]"
                  : "border-[var(--tv-champagne)] bg-white text-[var(--tv-ink)] hover:bg-[var(--tv-paper)]"
              }`}
            >
              <FileUp className="h-4 w-4 text-[var(--tv-brand)]" />
              Import Brand Guide (PDF)
            </button>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {actionNotice && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#1f6b3a]/30 bg-[#ddebdd]/60 px-4 py-2.5 text-sm font-medium text-[#1f6b3a]"
          >
            <span>&#10003; {actionNotice}</span>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="rounded p-0.5 hover:bg-black/5"
              aria-label="Dismiss notice"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionError && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#f2c4be] bg-[#f9ddd9]/60 px-4 py-2.5 text-sm font-medium text-[var(--tv-flag)]"
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="rounded p-0.5 hover:bg-black/5"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {canEdit && importOpen && (
          <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: EDITORIAL_EASE }}
            aria-label="Import Brand Guide"
            className="mt-5 rounded-2xl border-2 border-[var(--tv-champagne)] bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-lg font-semibold text-[var(--tv-brand)] sm:text-xl">
                  Import Brand Guide into Approval Checklist
                </h2>
                <p className="mt-1 text-xs text-[var(--tv-muted)] sm:text-sm">
                  Upload a PDF, DOCX, PPTX, TXT, or Markdown brand update (max 3 MB). Nothing enters
                  the approved library until a reviewer checks and approves each item.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded-lg p-1 text-[var(--tv-muted)] hover:bg-[var(--tv-paper)]"
                aria-label="Close importer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--tv-brand)] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[var(--tv-brand-ink)] active:scale-95 sm:text-sm">
                {importingFile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                <span>{importingFile ? "Extracting rules & facts…" : "Choose PDF / DOCX file"}</span>
                <input
                  type="file"
                  disabled={importingFile || savingChecklist}
                  accept=".pdf,.docx,.pptx,.rtf,.txt,.md"
                  onChange={handleBrandGuideFile}
                  className="sr-only"
                />
              </label>
              {importFilename && (
                <span className="text-xs font-medium text-[var(--tv-muted)]">
                  File: <strong className="text-[var(--tv-ink)]">{importFilename}</strong>
                </span>
              )}
            </div>

            {importSummary && (
              <p className="mt-3 rounded-xl bg-[var(--tv-paper)] px-3.5 py-2 text-xs font-medium text-[var(--tv-ink)] sm:text-sm">
                {importSummary}
              </p>
            )}

            {importItems.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                    Extracted Checklist ({importItems.length} items)
                  </p>
                  <button
                    type="button"
                    disabled={savingChecklist || selectedPendingCount === 0}
                    onClick={handleApproveSelectedImport}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1f6b3a] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#17522c] disabled:opacity-50"
                  >
                    {savingChecklist ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {savingChecklist
                        ? "Saving…"
                        : `Approve & Save Selected (${selectedPendingCount})`}
                    </span>
                  </button>
                </div>

                <ul className="space-y-2.5">
                  {importItems.map((cand) => {
                    const saved = cand.saveState === "saved";
                    return (
                      <li
                        key={cand.id}
                        className={`rounded-xl border p-3.5 text-xs transition ${
                          saved
                            ? "border-[#1f6b3a]/30 bg-[#ddebdd]/40"
                            : "border-[var(--tv-line)] bg-[#fcf9f3]"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={cand.checked}
                              disabled={saved}
                              onChange={(e) =>
                                setImportItems((prev) =>
                                  prev.map((x) =>
                                    x.id === cand.id ? { ...x, checked: e.target.checked } : x
                                  )
                                )
                              }
                              className="mt-0.5 h-4 w-4 accent-[var(--tv-brand)]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-[var(--tv-champagne)]/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--tv-brand)]">
                                  {cand.kind}
                                </span>
                                <span className="font-semibold text-[var(--tv-ink)]">
                                  {cand.title}
                                </span>
                              </div>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {Object.entries(cand.payload)
                                  .filter(([k]) => k !== "rule_ref" || cand.kind === "terms" || cand.kind === "claims")
                                  .slice(0, 4)
                                  .map(([k, v]) => (
                                    <div key={k}>
                                      <span className="block text-[10px] font-semibold uppercase text-[var(--tv-muted)]">
                                        {k.replace(/_/g, " ")}
                                      </span>
                                      {k === "source_id" && sourcesList.length > 0 ? (
                                        <select
                                          disabled={saved}
                                          value={String(v ?? "")}
                                          onChange={(e) =>
                                            updateCandidatePayload(cand.id, k, e.target.value)
                                          }
                                          className="mt-0.5 w-full rounded-lg border border-[var(--tv-line)] bg-white px-2 py-1 text-xs"
                                        >
                                          <option value="">(none)</option>
                                          {sourcesList.map((s) => {
                                            const sid = String(s.source_id ?? "");
                                            return (
                                              <option key={sid} value={sid}>
                                                {sid} · {String(s.title ?? "")}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      ) : (
                                        <input
                                          type="text"
                                          disabled={saved}
                                          value={v === null || v === undefined ? "" : String(v)}
                                          onChange={(e) => {
                                            const rawVal = e.target.value;
                                            const parsedVal =
                                              k.endsWith("_inr") || k === "discount_pct"
                                                ? rawVal === ""
                                                  ? null
                                                  : Number(rawVal)
                                                : rawVal;
                                            updateCandidatePayload(cand.id, k, parsedVal);
                                          }}
                                          className="mt-0.5 w-full rounded-lg border border-[var(--tv-line)] bg-white px-2 py-1 text-xs"
                                        />
                                      )}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </label>

                          <div className="shrink-0">
                            {saved ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#ddebdd] px-2.5 py-1 text-[11px] font-semibold text-[#1f6b3a]">
                                <Check className="h-3 w-3" /> Saved
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={cand.saveState === "saving" || savingChecklist}
                                onClick={() => saveSingleCandidate(cand)}
                                className="rounded-lg border border-[var(--tv-brand)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--tv-brand)] hover:bg-[var(--tv-brand)] hover:text-white disabled:opacity-50"
                              >
                                {cand.saveState === "saving" ? "Saving…" : "Approve & Save"}
                              </button>
                            )}
                          </div>
                        </div>

                        {cand.saveError && (
                          <p className="mt-2 text-[11px] font-medium text-[var(--tv-flag)]">
                            {cand.saveError}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {canEdit && editorMode !== "closed" && CRUD_TABS.has(tab) && (
          <motion.form
            onSubmit={handleSaveCrud}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: EDITORIAL_EASE }}
            className="mt-5 rounded-2xl border-2 border-[var(--tv-champagne)] bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-serif text-lg font-semibold text-[var(--tv-brand)]">
                {editorMode === "add"
                  ? `Add new ${current.singular}`
                  : `Edit ${current.singular} (${editingId})`}
              </h2>
              <button
                type="button"
                onClick={() => setEditorMode("closed")}
                className="rounded-lg p-1 text-[var(--tv-muted)] hover:bg-[var(--tv-paper)]"
                aria-label="Close form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {Object.entries(formState).map(([field, value]) => {
                const label = field.replace(/_/g, " ");
                const isSourceField = field === "source_id" && sourcesList.length > 0;
                const isRuleField = field === "rule_ref" && rulesList.length > 0;
                const isOfferStatus = tab === "offers" && field === "status";
                const isTermCategory = tab === "terms" && field === "category";
                const isClaimStatus = tab === "claims" && field === "status";
                const isDateField =
                  field === "effective_date" || field === "valid_from" || field === "valid_to";
                const isIntField = field.endsWith("_inr") || field === "discount_pct";

                return (
                  <div
                    key={field}
                    className={
                      field === "claim_text" || field === "fact_value" || field === "reason"
                        ? "sm:col-span-2"
                        : ""
                    }
                  >
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                      {label}
                    </label>
                    {isSourceField ? (
                      <select
                        value={value}
                        onChange={(e) =>
                          setFormState((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 px-3 py-2 text-sm outline-none focus:border-[var(--tv-brand)] focus:bg-white"
                      >
                        <option value="">(none)</option>
                        {sourcesList.map((s) => {
                          const sid = String(s.source_id ?? "");
                          return (
                            <option key={sid} value={sid}>
                              {sid} · {String(s.title ?? "")}
                            </option>
                          );
                        })}
                      </select>
                    ) : isRuleField ? (
                      <select
                        value={value}
                        onChange={(e) =>
                          setFormState((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 px-3 py-2 text-sm outline-none focus:border-[var(--tv-brand)] focus:bg-white"
                      >
                        {tab === "claims" && <option value="">(optional)</option>}
                        {rulesList.map((r) => {
                          const rid = String(r.rule_id ?? "");
                          return (
                            <option key={rid} value={rid}>
                              {rid} · {String(r.title ?? "")}
                            </option>
                          );
                        })}
                      </select>
                    ) : isOfferStatus ? (
                      <select
                        value={value || "active"}
                        onChange={(e) =>
                          setFormState((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 px-3 py-2 text-sm outline-none focus:border-[var(--tv-brand)] focus:bg-white"
                      >
                        <option value="active">active</option>
                        <option value="expired">expired</option>
                      </select>
                    ) : isTermCategory ? (
                      <select
                        value={value || "banned"}
                        onChange={(e) =>
                          setFormState((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 px-3 py-2 text-sm outline-none focus:border-[var(--tv-brand)] focus:bg-white"
                      >
                        <option value="banned">banned</option>
                        <option value="retired">retired</option>
                      </select>
                    ) : isClaimStatus ? (
                      <select
                        value={value || "approved"}
                        onChange={(e) =>
                          setFormState((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 px-3 py-2 text-sm outline-none focus:border-[var(--tv-brand)] focus:bg-white"
                      >
                        <option value="approved">approved</option>
                        <option value="restricted: needs review">restricted: needs review</option>
                        <option value="prohibited">prohibited</option>
                      </select>
                    ) : (
                      <input
                        type={isDateField ? "date" : isIntField ? "number" : "text"}
                        value={value}
                        onChange={(e) =>
                          setFormState((p) => ({ ...p, [field]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 px-3 py-2 text-sm outline-none focus:border-[var(--tv-brand)] focus:bg-white"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={savingItem}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--tv-brand)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--tv-brand-ink)] disabled:opacity-60 sm:text-sm"
              >
                {savingItem && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{savingItem ? "Saving…" : editorMode === "add" ? `Save ${current.singular}` : "Save changes"}</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorMode("closed")}
                className="rounded-xl border border-[var(--tv-line)] bg-white px-4 py-2 text-xs font-medium sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Sliding Pill Category Tabs */}
      <div
        role="group"
        aria-label="Library sections"
        className="mt-5 flex flex-wrap gap-2 sm:mt-6"
      >
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setTab(t.key);
                setQuery("");
                setSelectedIdx(0);
                setEditorMode("closed");
                setEditingRuleId(null);
                setConfirmArchiveId(null);
              }}
              className={`relative rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                active
                  ? "text-white"
                  : "border border-[var(--tv-edge)] bg-white/70 text-[var(--tv-ink)] hover:bg-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="library-tab-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-full bg-[var(--tv-brand)] shadow-xs"
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subheader + Search */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">{current.label}</h2>
          <p className="text-sm text-[var(--tv-muted)]">{current.help}</p>
        </div>
        <div className="w-full sm:w-80">
          <label htmlFor="library-search" className="text-sm font-medium">
            Search this list
          </label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tv-muted)]" />
            <input
              id="library-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIdx(0);
              }}
              placeholder={`Filter ${current.label.toLowerCase()}…`}
              className="block w-full rounded-xl border border-[var(--tv-edge)] bg-white py-2 pl-9 pr-8 text-sm outline-none transition focus:border-[var(--tv-brand)] focus:ring-2 focus:ring-[var(--tv-brand)]/15"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setSelectedIdx(0);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--tv-muted)] hover:bg-[var(--tv-paper)] hover:text-[var(--tv-ink)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="mt-6 grid gap-5 lg:grid-cols-12">
          <div className="space-y-2.5 lg:col-span-5">
            {[0, 1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-16 animate-pulse rounded-xl border border-[var(--tv-line)] bg-white/70"
              />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-2xl border border-[var(--tv-champagne)] bg-white/70 lg:col-span-7" />
        </div>
      )}

      {!loading && result?.error && (
        <p role="alert" className="mt-6 text-[var(--tv-flag)]">
          {result.error}
        </p>
      )}

      {!loading && !result?.error && shown.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-[var(--tv-edge)] bg-white/60 p-5 text-sm text-[var(--tv-muted)]">
          {items.length === 0 ? "Nothing in this list yet." : "No items match your search."}
        </p>
      )}

      {!loading && shown.length > 0 && selectedItem && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-[var(--tv-muted)]">
            Showing <strong className="text-[var(--tv-ink)]">{shown.length}</strong> of{" "}
            {items.length} &middot; Hover or click an entry to inspect its passport
          </p>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            <ul
              aria-label={`${current.label} index`}
              className="order-2 divide-y divide-[var(--tv-line)] overflow-hidden rounded-2xl border border-[var(--tv-line)] bg-white shadow-sm lg:order-1 lg:col-span-5 lg:max-h-[38rem] lg:overflow-y-auto"
            >
              {shown.map((item, i) => {
                const { keys, text } = titleOf(item);
                const isSelected = i === safeIdx;
                const stale = needsRecheck(item);

                const chips = Object.entries(item)
                  .filter(
                    ([k, v]) =>
                      !keys.includes(k) &&
                      k !== "id" &&
                      v !== null &&
                      v !== undefined &&
                      v !== "" &&
                      /(^|_)(id|code)$|status/i.test(k)
                  )
                  .slice(0, 2);

                return (
                  <li key={`${i}-${itemIdOf(item, tab)}`} className="relative">
                    {isSelected && (
                      <motion.span
                        layoutId="library-active-bar"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-[var(--tv-brand)]"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIdx(i);
                        setConfirmArchiveId(null);
                        setEditingRuleId(null);
                      }}
                      onMouseEnter={() => {
                        setSelectedIdx(i);
                        setConfirmArchiveId(null);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors ${
                        isSelected ? "bg-[#fbf7f0]" : "hover:bg-[#fcf9f3]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-semibold ${
                            isSelected ? "text-[var(--tv-brand)]" : "text-[var(--tv-ink)]"
                          }`}
                        >
                          <HighlightMatch text={text} query={query} />
                        </p>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {chips.map(([k, v]) => (
                            <span
                              key={k}
                              className="rounded-md border border-[var(--tv-line)] bg-white px-1.5 py-0.5 text-[var(--tv-muted)]"
                            >
                              {k.replace(/_/g, " ")}:{" "}
                              <strong className="font-medium text-[var(--tv-ink)]">
                                <HighlightMatch text={formatValue(v, k)} query={query} />
                              </strong>
                            </span>
                          ))}
                          {stale && (
                            <span className="rounded-full bg-[#f6e7c8] px-2 py-0.5 font-semibold text-[#7a4b00]">
                              Needs re-check
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                          isSelected
                            ? "translate-x-0.5 text-[var(--tv-brand)]"
                            : "text-[var(--tv-muted)]/60"
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="order-1 lg:sticky lg:top-6 lg:order-2 lg:col-span-7">
              <AnimatePresence mode="wait">
                {(() => {
                  const { keys, text } = titleOf(selectedItem);
                  const stale = needsRecheck(selectedItem);
                  const activeId = itemIdOf(selectedItem, tab);
                  const details = Object.entries(selectedItem).filter(
                    ([k]) => !keys.includes(k) && k !== "id"
                  );
                  const passportKey = `${tab}-${safeIdx}-${activeId || text}`;
                  const statusText =
                    typeof selectedItem.status === "string" && selectedItem.status.trim()
                      ? selectedItem.status.toUpperCase()
                      : "APPROVED";

                  return (
                    <motion.aside
                      key={passportKey}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.22, ease: EDITORIAL_EASE }}
                      aria-label="Selected item passport"
                      className="relative overflow-hidden rounded-3xl border-2 border-[var(--tv-champagne)] bg-white shadow-[0_18px_45px_-25px_rgba(88,24,46,0.22)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--tv-line)] bg-gradient-to-r from-[#fbf7f0] to-[#f4ead9] px-5 py-3.5 sm:px-6">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--tv-brand)]">
                          <BookOpen className="h-3.5 w-3.5" />
                          {current.singular} Passport
                        </span>

                        <motion.span
                          initial={{ scale: 1.3, rotate: -12, opacity: 0 }}
                          animate={{ scale: 1, rotate: -3, opacity: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 22,
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider shadow-xs ${
                            stale
                              ? "border-[#c98000]/45 bg-[#f6e7c8] text-[#7a4b00]"
                              : "border-[var(--tv-brand)]/35 bg-white text-[var(--tv-brand)]"
                          }`}
                        >
                          {stale ? (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          ) : (
                            <BadgeCheck className="h-3.5 w-3.5 text-[#1f6b3a]" />
                          )}
                          {stale ? "Needs Re-Check" : `Verified · ${statusText}`}
                        </motion.span>
                      </div>

                      <div className="p-5 sm:p-6">
                        <h3 className="font-serif text-xl font-semibold leading-snug text-[var(--tv-ink)] sm:text-2xl">
                          <HighlightMatch text={text} query={query} />
                        </h3>

                        {canEdit && activeId && (
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {CRUD_TABS.has(tab) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditDrawer(selectedItem)}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--tv-champagne)] bg-[var(--tv-paper)]/70 px-3 py-1.5 text-xs font-semibold text-[var(--tv-brand)] transition hover:bg-[var(--tv-paper)]"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  Edit {current.singular}
                                </button>

                                {confirmArchiveId === activeId ? (
                                  <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#f2c4be] bg-[#f9ddd9]/60 px-2.5 py-1">
                                    <span className="text-xs font-semibold text-[#9b1c13]">
                                      Archive {activeId}?
                                    </span>
                                    <button
                                      type="button"
                                      disabled={archivingId === activeId}
                                      onClick={() => handleArchiveItem(activeId)}
                                      className="rounded-lg bg-[#9b1c13] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#7d150e] disabled:opacity-60"
                                    >
                                      {archivingId === activeId ? "Archiving…" : "Confirm"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmArchiveId(null)}
                                      className="rounded-lg bg-white px-2 py-1 text-xs font-medium"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmArchiveId(activeId)}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--tv-line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--tv-muted)] transition hover:border-[#f2c4be] hover:text-[#9b1c13]"
                                  >
                                    <Archive className="h-3.5 w-3.5" />
                                    Archive
                                  </button>
                                )}
                              </>
                            )}

                            {tab === "sources" && (
                              <button
                                type="button"
                                disabled={savingPatchId === activeId}
                                onClick={() => handleMarkVerifiedToday(activeId)}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold shadow-xs transition disabled:opacity-60 ${
                                  stale
                                    ? "bg-[#1f6b3a] text-white hover:bg-[#17522c]"
                                    : "border border-[var(--tv-champagne)] bg-[var(--tv-paper)]/70 text-[var(--tv-brand)] hover:bg-[var(--tv-paper)]"
                                }`}
                              >
                                {savingPatchId === activeId ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                )}
                                <span>
                                  {savingPatchId === activeId ? "Updating…" : "Mark verified today"}
                                </span>
                              </button>
                            )}

                            {tab === "rules" && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingRuleId === activeId) {
                                    setEditingRuleId(null);
                                  } else {
                                    setEditingRuleId(activeId);
                                    setRuleDraft({
                                      title: String(selectedItem.title ?? ""),
                                      text: String(selectedItem.text ?? ""),
                                    });
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--tv-champagne)] bg-[var(--tv-paper)]/70 px-3 py-1.5 text-xs font-semibold text-[var(--tv-brand)] transition hover:bg-[var(--tv-paper)]"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                {editingRuleId === activeId ? "Close editor" : "Edit rule wording"}
                              </button>
                            )}
                          </div>
                        )}

                        {canEdit && tab === "rules" && editingRuleId === activeId && (
                          <div className="mt-4 space-y-2.5 rounded-2xl border border-[var(--tv-champagne)] bg-[#fbf7f0] p-4 text-xs">
                            <div>
                              <label className="block font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                                Rule Title
                              </label>
                              <input
                                type="text"
                                value={ruleDraft.title}
                                onChange={(e) =>
                                  setRuleDraft((p) => ({ ...p, title: e.target.value }))
                                }
                                className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-white px-3 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                                Rule Wording
                              </label>
                              <textarea
                                rows={3}
                                value={ruleDraft.text}
                                onChange={(e) =>
                                  setRuleDraft((p) => ({ ...p, text: e.target.value }))
                                }
                                className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-white p-2.5 text-sm"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={savingPatchId === activeId}
                                onClick={() => handleSaveRuleWording(activeId)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--tv-brand)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--tv-brand-ink)] disabled:opacity-60"
                              >
                                <RefreshCw className="h-3 w-3" />
                                {savingPatchId === activeId ? "Saving…" : "Save clearer wording"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingRuleId(null)}
                                className="rounded-xl border border-[var(--tv-line)] bg-white px-3 py-1.5 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {details.length > 0 && (
                          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                            {details.map(([k, v]) => (
                              <div
                                key={k}
                                className="rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/55 px-3.5 py-2.5"
                              >
                                <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                                  {k.replace(/_inr$/, "").replace(/_/g, " ")}
                                </dt>
                                <dd className="mt-0.5 break-words text-sm font-medium text-[var(--tv-ink)]">
                                  <HighlightMatch text={formatValue(v, k)} query={query} />
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--tv-line)] bg-[#fcf9f3] px-5 py-3 text-xs text-[var(--tv-muted)] sm:px-6">
                        <span>
                          Record {safeIdx + 1} of {shown.length}
                        </span>
                        {activeId && <span className="font-mono text-[11px]">ID: {activeId}</span>}
                      </div>
                    </motion.aside>
                  );
                })()}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      <p className="mt-8 text-sm text-[var(--tv-muted)]">
        {canEdit
          ? "Reviewers and admins can add, edit, archive, verify sources, refine rule wording, or import a Brand Guide PDF for checklist approval."
          : "Logged in as Creator — only Reviewers and Admins can edit or import items into the approved library."}
      </p>
    </div>
  );
}
