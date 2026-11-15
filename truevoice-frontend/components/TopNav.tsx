"use client";

import Logo from "@/components/Logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/SessionContext";

const NAV_ITEMS = [
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
  const initial = (displayName.trim().charAt(0) || "U").toUpperCase();

  const activeIdx = Math.max(
    0,
    NAV_ITEMS.findIndex((item) =>
      item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)
    )
  );

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-[var(--tv-brand-ink)] via-[var(--tv-brand)] to-[#54162e] text-[var(--tv-paper)] shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
        <Link href="/dashboard" className="flex items-center gap-2.5 text-[var(--tv-champagne)]">
          <Logo />
        </Link>

        {/* Desktop navigation: the sliding pill (1024px and wider) */}
        <nav
          aria-label="Primary"
          className="relative hidden grid-cols-5 rounded-full bg-black/25 p-1 lg:grid"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/5)] rounded-full bg-[var(--tv-champagne)] shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${activeIdx * 100}%)` }}
          />
          {NAV_ITEMS.map((item, idx) => {
            const isActive = idx === activeIdx;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative z-10 min-w-[96px] rounded-full px-3 py-1.5 text-center text-sm font-medium transition-colors duration-200 ${
                  isActive ? "text-[var(--tv-brand-ink)]" : "text-[var(--tv-paper)]/85 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs sm:px-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--tv-champagne)] font-semibold text-[var(--tv-brand-ink)]">
              {initial}
            </span>
            <span className="sr-only sm:hidden">
              {displayName}, {displayRole}
            </span>
            <span className="hidden font-medium sm:inline">
              {displayName} &middot;{" "}
              <span className="capitalize text-[var(--tv-champagne)]">{displayRole}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="min-h-10 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium transition hover:bg-white/15 active:scale-95"
          >
            Log out
          </button>
        </div>
      </div>

      {/* Phone and tablet navigation: a row of links that scrolls sideways (below 1024px) */}
      <nav aria-label="Primary" className="border-t border-white/10 lg:hidden">
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {NAV_ITEMS.map((item, idx) => {
            const isActive = idx === activeIdx;
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
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