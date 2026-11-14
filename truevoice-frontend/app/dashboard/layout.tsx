"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import { api, ApiError } from "@/lib/api";
import { clearSession, getSession } from "@/lib/session";
import { SessionContext } from "@/lib/SessionContext";

const SESSION_KEY = "truevoice_session";

function subscribeToSession(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getSessionSnapshot(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function getServerSessionSnapshot(): null {
  return null;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  const sessionRaw = useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    getServerSessionSnapshot
  );

  const session = sessionRaw ? getSession() : null;

  useEffect(() => {
    if (!sessionRaw || !session) {
      router.replace("/login");
      return;
    }

    api("/auth/me").catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        router.replace("/login");
      }
    });
  }, [sessionRaw, session, router]);

  function handleLogout() {
    clearSession();
    router.replace("/login");
  }

  if (!session) {
    return <p className="p-8 text-[var(--tv-muted)]">Loading…</p>;
  }

  return (
    <SessionContext.Provider value={session}>
      <div className="min-h-screen">
        <TopNav onLogout={handleLogout} />
        <main className="p-6 md:p-10">{children}</main>
      </div>
    </SessionContext.Provider>
  );
}
