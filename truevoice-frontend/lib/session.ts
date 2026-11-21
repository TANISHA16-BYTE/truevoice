// Keeps the logged-in user in the browser so a page refresh does not log them out.
export type User = { id?: string; name: string; email: string; role: string };
export type Session = { token: string; user: User };

const KEY = "truevoice_session";
export const SESSION_EVENT = "truevoice-session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    /* storage unavailable: user will need to log in again */
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    /* nothing to clear */
  }
}
