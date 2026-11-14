"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { useSession } from "@/lib/SessionContext";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/library", label: "Library" },
  { href: "/dashboard/submit", label: "Submit draft" },
  { href: "/dashboard/review", label: "Review queue" },
];

export default function TopNav({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();

  return (
    <header className="border-b border-[var(--tv-champagne)]/25 bg-[var(--tv-brand)] px-6 py-3.5 text-[var(--tv-paper)] shadow-sm md:px-10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <Link href="/dashboard" className="rounded-md focus-visible:outline-offset-4">
          <Logo className="text-xl text-[var(--tv-champagne)]" />
        </Link>

        <nav
          aria-label="Main"
          className="flex items-center gap-1 overflow-x-auto rounded-full bg-[var(--tv-brand-ink)]/60 p-1 ring-1 ring-[var(--tv-champagne)]/20"
        >
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition ${
                  active
                    ? "bg-[var(--tv-champagne)] font-semibold text-[var(--tv-brand-ink)] shadow-sm"
                    : "text-[var(--tv-paper)]/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <div className="hidden items-center gap-2 rounded-full bg-[var(--tv-brand-ink)]/50 px-3 py-1.5 ring-1 ring-[var(--tv-champagne)]/20 sm:flex">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--tv-champagne)] text-xs font-bold uppercase text-[var(--tv-brand-ink)]">
              {user.name.slice(0, 1)}
            </span>
            <span className="font-medium text-[var(--tv-paper)]">{user.name}</span>
            <span className="capitalize text-[var(--tv-champagne)]">&middot; {user.role}</span>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-[var(--tv-champagne)]/50 px-3.5 py-1.5 font-medium text-[var(--tv-champagne)] transition hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}