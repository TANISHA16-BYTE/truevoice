"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/SessionContext";

type RoleName = "creator" | "reviewer" | "admin";

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: RoleName | string;
  created_at?: string;
};

type UsersListResponse = {
  users?: TeamMember[];
};

type UpdateRoleResponse = {
  success?: boolean;
  message?: string;
  user?: TeamMember;
};

type CreateUserResponse = {
  success?: boolean;
  message?: string;
  user?: TeamMember;
};

const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const;

const ROLE_BADGE_STYLE: Record<string, string> = {
  admin: "bg-[var(--tv-brand)] text-white",
  reviewer: "bg-[#EFE5CE] text-[var(--tv-brand-ink)] border border-[var(--tv-champagne)]",
  creator: "bg-[#ddebdd] text-[#1f6b3a]",
};

const ROLE_WORKFLOWS = [
  {
    role: "Content Creator",
    key: "creator",
    summary: "Creates, checks, and revises drafts before submission.",
    permissions: [
      "Run instant & batch compliance scans against approved library",
      "Apply grounded safe rewrites & submit own drafts for human approval",
      "Read-only access to Approved Library & Guideline Health metrics",
    ],
  },
  {
    role: "Reviewer",
    key: "reviewer",
    summary: "Audits team drafts, issues tamper-proof approval badges, and tunes AI nuance.",
    permissions: [
      "View team Review Queue and inspect line-by-line claim citations",
      "Approve drafts (minting SHA-256 badges), request changes, or dismiss findings",
      "Report AI mistakes & export compliance audit logs (CSV / JSON)",
    ],
  },
  {
    role: "Administrator",
    key: "admin",
    summary: "Full governance over knowledge library rules, brand guides, and team access.",
    permissions: [
      "Everything Reviewers can do across the review & audit workflow",
      "Create, edit, archive, verify & import Brand Guide PDFs into the Library",
      "Onboard teammates and promote/update member roles (self-demotion locked)",
    ],
  },
];

function formatJoined(dateStr?: string): string {
  if (!dateStr) return "Workspace member";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return String(dateStr).slice(0, 10);
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function TeamRolesPage() {
  const { user } = useSession();
  const isAdmin = (user?.role ?? "").toLowerCase() === "admin";

  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | RoleName>("all");

  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, { ok: boolean; text: string }>>({});

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleName>("creator");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadError(null);
    try {
      const res = await api<UsersListResponse>("/users");
      setMembers(Array.isArray(res.users) ? res.users : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load team directory.");
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  async function handleRoleChange(member: TeamMember, nextRole: RoleName) {
    if (member.role === nextRole) return;
    setSavingId(member.id);
    setRowStatus((prev) => {
      const copy = { ...prev };
      delete copy[member.id];
      return copy;
    });

    try {
      const res = await api<UpdateRoleResponse>(`/users/${encodeURIComponent(member.id)}/role`, {
        method: "PATCH",
        body: { role: nextRole },
      });
      const updated = res.user;
      if (updated) {
        setMembers((prev) =>
          prev ? prev.map((m) => (m.id === member.id ? updated : m)) : prev
        );
      }
      setRowStatus((prev) => ({
        ...prev,
        [member.id]: { ok: true, text: res.message || `Updated to ${nextRole}.` },
      }));
    } catch (err) {
      setRowStatus((prev) => ({
        ...prev,
        [member.id]: {
          ok: false,
          text: err instanceof Error ? err.message : "Could not update role.",
        },
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleInviteSubmit(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await api<CreateUserResponse>("/users", {
        method: "POST",
        body: {
          name: inviteName,
          email: inviteEmail,
          password: invitePassword,
          role: inviteRole,
        },
      });
      if (res.user) {
        setMembers((prev) => (prev ? [res.user!, ...prev] : [res.user!]));
      }
      setInviteMsg({
        ok: true,
        text: res.message || `${inviteName} onboarded as ${inviteRole}.`,
      });
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("creator");
    } catch (err) {
      setInviteMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Could not onboard teammate.",
      });
    } finally {
      setInviting(false);
    }
  }

  const counts = useMemo(() => {
    const list = members ?? [];
    return {
      total: list.length,
      creators: list.filter((u) => u.role === "creator").length,
      reviewers: list.filter((u) => u.role === "reviewer").length,
      admins: list.filter((u) => u.role === "admin").length,
    };
  }, [members]);

  const filteredMembers = useMemo(() => {
    const list = members ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
      );
    });
  }, [members, search, roleFilter]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-3xl border border-[var(--tv-champagne)] bg-white p-6 shadow-xs sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--tv-paper)] text-[var(--tv-brand)]">
              <Lock className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-serif text-2xl font-semibold text-[var(--tv-ink)]">
                Admin permission required
              </h1>
              <p className="mt-1.5 text-sm text-[var(--tv-muted)]">
                Only workspace <strong>Administrators</strong> can view the team roster, onboard new
                members, or promote users between Creator, Reviewer, and Admin roles. Your current
                role is <strong className="capitalize text-[var(--tv-ink)]">{user.role}</strong>.
              </p>
              <Link
                href="/dashboard"
                className="mt-4 inline-flex items-center rounded-xl bg-[var(--tv-brand)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)]"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: EDITORIAL_EASE }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="font-serif text-2xl font-semibold sm:text-4xl">Team &amp; Roles</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--tv-muted)] sm:text-base">
            Onboard teammates and manage role-based workflows. Self-signup accounts start as{" "}
            <strong>Creator</strong> until promoted by an Admin.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowInvite((v) => !v);
            setInviteMsg(null);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--tv-brand)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--tv-brand-ink)] active:scale-[0.98]"
        >
          <UserPlus className="h-4 w-4" />
          <span>{showInvite ? "Close onboarding form" : "Onboard teammate"}</span>
        </button>
      </motion.div>

      <AnimatePresence initial={false}>
        {showInvite && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EDITORIAL_EASE }}
            className="overflow-hidden"
          >
            <form
              onSubmit={handleInviteSubmit}
              className="rounded-3xl border border-[var(--tv-champagne)] bg-white p-5 shadow-xs sm:p-6"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-[var(--tv-brand)]" />
                <h2 className="font-serif text-lg font-semibold">Add &amp; assign teammate</h2>
              </div>
              <p className="mt-1 text-xs text-[var(--tv-muted)]">
                Create a workspace account with its intended role immediately, ready to sign in.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Siddhi Verma"
                    className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 px-3 py-2 text-sm outline-none focus:border-[var(--tv-brand)] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="siddhi@glowvale.demo"
                    className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 px-3 py-2 text-sm outline-none focus:border-[var(--tv-brand)] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                    Temp Password (8+ chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 px-3 py-2 text-sm outline-none focus:border-[var(--tv-brand)] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
                    Assigned Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as RoleName)}
                    className="mt-1 w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 px-3 py-2 text-sm font-medium outline-none focus:border-[var(--tv-brand)] focus:bg-white"
                  >
                    <option value="creator">Content Creator</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              {inviteMsg && (
                <p
                  role={inviteMsg.ok ? "status" : "alert"}
                  className={`mt-3 rounded-xl px-3.5 py-2 text-xs font-medium ${
                    inviteMsg.ok
                      ? "bg-[#ddebdd] text-[#1f6b3a]"
                      : "bg-[#f9ddd9] text-[#9b1c13]"
                  }`}
                >
                  {inviteMsg.text}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={inviting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--tv-brand)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--tv-brand-ink)] disabled:opacity-60"
                >
                  {inviting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>{inviting ? "Onboarding…" : "Create teammate account"}</span>
                </button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--tv-line)] bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-muted)]">
            Team Members
          </p>
          <p className="mt-1.5 font-serif text-3xl font-semibold text-[var(--tv-ink)] tabular-nums">
            {counts.total}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--tv-line)] bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#1f6b3a]">
            Creators
          </p>
          <p className="mt-1.5 font-serif text-3xl font-semibold text-[var(--tv-ink)] tabular-nums">
            {counts.creators}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--tv-line)] bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#7a4b00]">
            Reviewers
          </p>
          <p className="mt-1.5 font-serif text-3xl font-semibold text-[var(--tv-ink)] tabular-nums">
            {counts.reviewers}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--tv-line)] bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--tv-brand)]">
            Administrators
          </p>
          <p className="mt-1.5 font-serif text-3xl font-semibold text-[var(--tv-ink)] tabular-nums">
            {counts.admins}
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-[var(--tv-line)] bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tv-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name or email..."
              className="w-full rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)]/50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--tv-brand)] focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["all", "creator", "reviewer", "admin"] as const).map((r) => {
              const active = roleFilter === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                    active
                      ? "bg-[var(--tv-brand)] text-white"
                      : "border border-[var(--tv-line)] bg-[var(--tv-paper)]/60 text-[var(--tv-muted)] hover:text-[var(--tv-ink)]"
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        {loadError && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-xl border border-[#9b1c13]/30 bg-[#f9ddd9]/70 px-4 py-3 text-sm font-medium text-[#9b1c13]"
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {members === null && !loadError && (
          <div className="mt-4 space-y-2.5">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-16 animate-pulse rounded-2xl bg-[var(--tv-paper)]" />
            ))}
          </div>
        )}

        {members && filteredMembers.length === 0 && (
          <p className="mt-5 rounded-2xl border border-dashed border-[var(--tv-edge)] bg-[var(--tv-paper)]/50 p-6 text-center text-sm text-[var(--tv-muted)]">
            No workspace members match this filter.
          </p>
        )}

        {members && filteredMembers.length > 0 && (
          <ul className="mt-4 divide-y divide-[var(--tv-line)]">
            {filteredMembers.map((m) => {
              const isSelf =
                (user.id && m.id === user.id) ||
                m.email.toLowerCase() === (user.email ?? "").toLowerCase();
              const isSaving = savingId === m.id;
              const status = rowStatus[m.id];
              const badgeCls = ROLE_BADGE_STYLE[m.role] ?? "bg-[var(--tv-paper)] text-[var(--tv-ink)]";

              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-3 py-4 first:pt-2 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tv-champagne)] font-serif text-base font-bold text-[var(--tv-brand-ink)]">
                      {(m.name.trim().charAt(0) || "U").toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[var(--tv-ink)]">{m.name}</p>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${badgeCls}`}
                        >
                          {m.role}
                        </span>
                        {isSelf && (
                          <span className="rounded-full border border-[var(--tv-champagne)] bg-[var(--tv-paper)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tv-muted)]">
                            You
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-[var(--tv-muted)]">
                        {m.email} · Joined {formatJoined(m.created_at)}
                      </p>
                      {status && (
                        <p
                          role={status.ok ? "status" : "alert"}
                          className={`mt-1 text-xs font-medium ${
                            status.ok ? "text-[#1f6b3a]" : "text-[#9b1c13]"
                          }`}
                        >
                          {status.text}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin text-[var(--tv-brand)]" />}
                    {isSelf ? (
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--tv-line)] bg-[var(--tv-paper)] px-3 py-1.5 text-xs font-medium text-[var(--tv-muted)]">
                        <Lock className="h-3.5 w-3.5 text-[var(--tv-brand)]" />
                        Self-demotion locked
                      </span>
                    ) : (
                      <label className="flex items-center gap-2 text-xs font-medium text-[var(--tv-muted)]">
                        <span className="sr-only">Role for {m.name}</span>
                        <select
                          disabled={isSaving}
                          value={m.role}
                          onChange={(e) => void handleRoleChange(m, e.target.value as RoleName)}
                          className="rounded-xl border border-[var(--tv-champagne)] bg-[var(--tv-paper)]/60 px-3 py-1.5 text-xs font-semibold capitalize text-[var(--tv-ink)] outline-none transition focus:border-[var(--tv-brand)] focus:bg-white disabled:opacity-60"
                        >
                          <option value="creator">Creator</option>
                          <option value="reviewer">Reviewer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--tv-brand)]" />
          <h2 className="font-serif text-xl font-semibold">Workspace Role Permissions</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {ROLE_WORKFLOWS.map((wf) => (
            <div
              key={wf.key}
              className="rounded-2xl border border-[var(--tv-line)] bg-white p-5 shadow-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif text-lg font-semibold text-[var(--tv-ink)]">{wf.role}</h3>
                <ShieldCheck className="h-4 w-4 text-[var(--tv-brand)]" />
              </div>
              <p className="mt-1 text-xs text-[var(--tv-muted)]">{wf.summary}</p>
              <ul className="mt-3 space-y-1.5 text-xs text-[var(--tv-ink)]">
                {wf.permissions.map((perm) => (
                  <li key={perm} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1f6b3a]" />
                    <span>{perm}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
