"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/SessionContext";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/library", label: "Library" },
  { href: "/dashboard/submit", label: "Submit draft" },
  { href: "/dashboard/review", label: "Review queue" },
];

export default function Sidebar({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();

  return (
    <aside className="flex flex-col gap-4 border-b border-[var(--tv-line)] bg-white p-4 md:min-h-screen md:w-64 md:border-b-0 md:border-r md:p-6">
      <p className="font-serif text-2xl font-semibold text-[var(--tv-brand)]">TrueVoice</p>

      <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-md px-3 py-2 ${
                active
                  ? "bg-[var(--tv-brand)] font-medium text-white"
                  : "text-[var(--tv-ink)] hover:bg-[var(--tv-paper)]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--tv-line)] pt-4">
        <p className="font-medium">{user.name}</p>
        <p className="text-sm capitalize text-[var(--tv-muted)]">{user.role}</p>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 rounded-md border border-[var(--tv-edge)] px-3 py-1.5 text-sm hover:bg-[var(--tv-paper)]"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}