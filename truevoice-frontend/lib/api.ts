import { getSession, saveSession, type Session, type User } from "./session";

type Json = Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Options = {
  method?: string;
  body?: unknown;
  skipAuth?: boolean; // true for calls made before login
  token?: string; // use a specific token instead of the saved one
};

function pickMessage(data: Json): string | null {
  const raw = data.error ?? data.message;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const inner = (raw as Json).message;
    if (typeof inner === "string") return inner;
  }
  return null;
}

// Talks to Tanisha's backend through the /backend proxy set up in next.config.ts.
export async function api<T = Json>(path: string, options: Options = {}): Promise<T> {
  const token = options.token ?? (options.skipAuth ? undefined : getSession()?.token);

  let res: Response;
  try {
    res = await fetch(`/backend${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  let data: Json = {};
  try {
    data = (await res.json()) as Json;
  } catch {
    /* response had no JSON body */
  }

  if (!res.ok) {
    const message = pickMessage(data);
    if (!message && res.status >= 500) {
      throw new ApiError(
        "Can't reach the TrueVoice backend. Start it with npm start in truevoice-backend.",
        res.status
      );
    }
    throw new ApiError(message ?? `Something went wrong (error ${res.status}).`, res.status);
  }
  return data as T;
}

// The backend may return the user as { user: {...} } or as the user itself.
function toUser(raw: unknown, fallbackEmail: string): User {
  const top = (raw && typeof raw === "object" ? raw : {}) as Json;
  const inner = (top.user && typeof top.user === "object" ? top.user : top) as Json;
  return {
    name: String(inner.name ?? inner.full_name ?? fallbackEmail),
    email: String(inner.email ?? fallbackEmail),
    role: String(inner.role ?? "creator"),
  };
}

export async function login(email: string, password: string): Promise<Session> {
  const data = await api<Json>("/auth/login", {
    method: "POST",
    body: { email, password },
    skipAuth: true,
  });

  const token = data.token ?? data.access_token ?? data.jwt;
  if (typeof token !== "string") {
    throw new ApiError(
      "Login succeeded but no token came back. Ask Tanisha which field holds the token.",
      500
    );
  }

  const user = data.user
    ? toUser(data.user, email)
    : toUser(await api<Json>("/auth/me", { token }), email);

  const session: Session = { token, user };
  saveSession(session);
  return session;
}

export async function signup(name: string, email: string, password: string): Promise<Session> {
  try {
    await api("/auth/signup", {
      method: "POST",
      body: { name, email, password },
      skipAuth: true,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new ApiError(
        "Sign up isn't available in the demo yet. Log in with a demo account instead.",
        404
      );
    }
    throw err;
  }
  return login(email, password);
}