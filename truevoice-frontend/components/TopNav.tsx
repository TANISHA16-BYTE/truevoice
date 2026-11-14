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
    <header className="flex flex-wrap items-center gap-x-8 gap-y-3 bg-[var(--tv-brand)] px-6 py-3 text-[var(--tv-paper)] md:px-10">
      <Logo className="text-xl text-[var(--tv-champagne)]" />

      <nav aria-label="Main" className="flex flex-1 gap-1 overflow-x-auto">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-2 ${
                active
                  ? "bg-[var(--tv-champagne)] font-medium text-[var(--tv-brand-ink)]"
                  : "hover:bg-white/10"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 text-sm">
        <span>
          {user.name} <span className="capitalize text-[var(--tv-champagne)]">&middot; {user.role}</span>
        </span>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-md border border-[var(--tv-champagne)] px-3 py-1.5 hover:bg-white/10"
        >
          Log out
        </button>
      </div>
    </header>
  );
}