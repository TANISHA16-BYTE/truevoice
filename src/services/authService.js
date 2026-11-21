const crypto = require("crypto");
const config = require("../config");
const db = require("../db/database");

const ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

function hashPassword(password) {
  if (typeof password !== "string" || !password) throw new TypeError("Password must be a non-empty string.");
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function safeEqual(a, b) {
  const left = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
  const right = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") return false;
  try {
    if (/^[a-f0-9]{64}$/i.test(storedHash)) {
      const legacy = crypto.pbkdf2Sync(password, "truevoice-salt-2026", 1000, 32, DIGEST).toString("hex");
      return safeEqual(legacy.toLowerCase(), storedHash.toLowerCase());
    }
    const [scheme, rounds, salt64, hash64] = storedHash.split("$");
    const iterations = Number(rounds);
    if (scheme !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000 || !salt64 || !hash64) return false;
    const salt = Buffer.from(salt64, "base64");
    const expected = Buffer.from(hash64, "base64");
    if (salt.length < 16 || expected.length !== KEY_LENGTH) return false;
    return safeEqual(crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST), expected);
  } catch { return false; }
}

function base64UrlEncode(value) { return Buffer.from(value).toString("base64url"); }
function base64UrlDecode(value) { return Buffer.from(value, "base64url").toString("utf8"); }

function generateJWT(payload) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: now, exp: now + 86400 * 7 }));
  const input = `${header}.${body}`;
  const signature = crypto.createHmac("sha256", config.JWT_SECRET).update(input).digest("base64url");
  return `${input}.${signature}`;
}

function verifyJWT(token) {
  if (typeof token !== "string" || token.length > 8192) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some(part => !part)) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    if (!header || header.alg !== "HS256" || header.typ !== "JWT") return null;
    const expected = crypto.createHmac("sha256", config.JWT_SECRET).update(`${encodedHeader}.${encodedPayload}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.userId !== "string" || !payload.userId || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= now || payload.iat > now + 60 || payload.exp <= payload.iat) return null;
    return payload;
  } catch { return null; }
}

// Async-compatible now: awaits work with both the current SQLite adapter and PostgreSQL.
async function registerUser(name, email, password) {
  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.get("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
  if (existing) return null;
  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const createdAt = new Date().toISOString();
  try {
    await db.run(
      "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'creator', ?)",
      [id, normalizedName, normalizedEmail, passwordHash, createdAt]
    );
  } catch (error) {
    if ((error.code === "ERR_SQLITE_ERROR" || error.code === "23505") && /unique|constraint|duplicate/i.test(error.message)) return null;
    throw error;
  }
  return await db.get("SELECT id, name, email, role FROM users WHERE id = ?", [id]);
}

async function authenticateUser(email, password) {
  if (typeof email !== "string" || typeof password !== "string") return null;
  const user = await db.get("SELECT * FROM users WHERE email = ?", [email.toLowerCase().trim()]);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  if (/^[a-f0-9]{64}$/i.test(user.password_hash)) {
    await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(password), user.id]);
  }
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token: generateJWT({ userId: user.id })
  };
}

async function getUserFromToken(token) {
  const payload = verifyJWT(token);
  if (!payload) return null;
  return await db.get("SELECT id, name, email, role FROM users WHERE id = ?", [payload.userId]);
}

module.exports = { hashPassword, verifyPassword, generateJWT, verifyJWT, authenticateUser, registerUser, getUserFromToken };
