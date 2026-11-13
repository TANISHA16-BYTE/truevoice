"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { api, ApiError } from "@/lib/api";
import { clearSession, getSession, type Session } from "@/lib/session";
import { SessionContext } from "@/lib/SessionContext";

// Every page inside /dashboard goes through here, so this is where we
// make sure the person is logged in.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const saved = getSession();
    if (!saved) {
      router.replace("/login");
      return;
    }
    setSession(saved);

    // If the saved token has expired, send them back to log in again.
    api("/auth/me").catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        router.replace("/login");
      }
    });
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  if (!session) {
    return <p className="p-8 text-[var(--tv-muted)]">Loading…</p>;
  }

  return (
    <SessionContext.Provider value={session}>
      <div className="min-h-screen md:flex">
        <Sidebar onLogout={handleLogout} />
        <main className="flex-1 p-6 md:p-10">{children}</main>
      </div>
    </SessionContext.Provider>
  );
}