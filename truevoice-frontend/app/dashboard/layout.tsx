"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, MotionConfig } from "framer-motion";
import TopNav from "@/components/TopNav";
import { api, ApiError } from "@/lib/api";
import { clearSession, getSession } from "@/lib/session";
import { SessionContext } from "@/lib/SessionContext";

const SESSION_KEY = "truevoice_session";
const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const;

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
  const pathname = usePathname();

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--tv-paper)] p-6">
        <div className="flex items-center gap-3 rounded-full border border-[var(--tv-champagne)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--tv-brand)] shadow-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--tv-champagne)] border-t-[var(--tv-brand)]" />
          <span>Loading TrueVoice…</span>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <SessionContext.Provider value={session}>
        <div className="relative min-h-screen">
          {/* Global Living Ambient Canvas (Editorial Dot-Grid + Drifting Aurora Glows) */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[var(--tv-paper)]"
          >
            <div className="tv-canvas-dots absolute inset-0 opacity-75" />
            <div className="animate-aurora absolute -left-24 top-10 h-[440px] w-[440px] rounded-full bg-[#d9bc98]/35 blur-3xl" />
            <div className="animate-aurora-reverse absolute -right-24 top-1/3 h-[420px] w-[420px] rounded-full bg-[#6e1f3d]/[0.07] blur-3xl" />
            <div className="animate-aurora absolute -bottom-24 left-1/3 h-[380px] w-[480px] rounded-full bg-[#d9bc98]/30 blur-3xl" />
          </div>

          <TopNav onLogout={handleLogout} />

          {/* overflow-x-clip keeps sticky elements working while blocking horizontal overflow */}
          <main className="overflow-x-clip px-4 py-5 sm:px-6 sm:py-8 md:p-10">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: EDITORIAL_EASE }}
            >
              {children}
            </motion.div>
          </main>
        </div>
      </SessionContext.Provider>
    </MotionConfig>
  );
}