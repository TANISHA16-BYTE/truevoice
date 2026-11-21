"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { useSession } from "@/lib/SessionContext";

const BASE_NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Library", href: "/dashboard/library" },
  { label: "Submit draft", href: "/dashboard/submit" },
  { label: "Review queue", href: "/dashboard/review" },
  { label: "Health", href: "/dashboard/health" },
];

export default function TopNav({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();
  const displayName = user?.name || "User";
  const displayRole = user?.role || "member";
  const isAdmin = displayRole.toLowerCase() === "admin";
  const navItems = isAdmin
    ? [...BASE_NAV_ITEMS, { label: "Team", href: "/dashboard/team" }]
    : BASE_NAV_ITEMS;
  const initial = (displayName.trim().charAt(0) || "U").toUpperCase();

  const activeIdx = Math.max(
    0,
    navItems.findIndex((item) =>
      item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)
    )
  );

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-[var(--tv-brand-ink)] via-[var(--tv-brand)] to-[#54162e] text-[var(--tv-paper)] shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-3.5">
        <Link
          href="/dashboard"
          className="flex min-w-0 shrink-0 items-center gap-2.5 text-[var(--tv-champagne)]"
        >
          <Logo />
        </Link>

        <nav
          aria-label="Primary"
          className="relative hidden rounded-full bg-black/25 p-1 lg:grid"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 rounded-full bg-[var(--tv-champagne)] shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{
              width: `calc((100% - 0.5rem) / ${navItems.length})`,
              transform: `translateX(${activeIdx * 100}%)`,
            }}
          />
          {navItems.map((item, idx) => {
            const isActive = idx === activeIdx;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative z-10 min-w-[88px] rounded-full px-3 py-1.5 text-center text-sm font-medium transition-colors duration-200 ${
                  isActive ? "text-[var(--tv-brand-ink)]" : "text-[var(--tv-paper)]/85 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs sm:px-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--tv-champagne)] font-semibold text-[var(--tv-brand-ink)]">
              {initial}
            </span>
            <span className="sr-only sm:hidden">
              {displayName}, {displayRole}
            </span>
            <span className="hidden max-w-[180px] truncate font-medium sm:inline">
              {displayName} &middot;{" "}
              <span className="capitalize text-[var(--tv-champagne)]">{displayRole}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="min-h-10 shrink-0 whitespace-nowrap rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium transition hover:bg-white/15 active:scale-95"
          >
            Log out
          </button>
        </div>
      </div>

      <nav aria-label="Primary" className="border-t border-white/10 lg:hidden">
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
          {navItems.map((item, idx) => {
            const isActive = idx === activeIdx;
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium transition-colors sm:px-4 sm:py-2.5 sm:text-sm ${
                    isActive
                      ? "bg-[var(--tv-champagne)] text-[var(--tv-brand-ink)]"
                      : "text-[var(--tv-paper)]/90 hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
