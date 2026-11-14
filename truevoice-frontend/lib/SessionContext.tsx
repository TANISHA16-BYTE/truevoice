"use client";

import { createContext, useContext } from "react";
import type { Session } from "./session";

export const SessionContext = createContext<Session | null>(null);

// Any dashboard page can call useSession() to get { token, user }.
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside the dashboard.");
  return session;
}