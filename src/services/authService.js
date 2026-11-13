// Authentication & RBAC Service (Self-contained JWT & PBKDF2)
const crypto = require("crypto");
const config = require("../config");
const db = require("../db/database");

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, "truevoice-salt-2026", 1000, 32, "sha256").toString("hex");
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  return Buffer.from(str, "base64").toString("utf-8");
}

function generateJWT(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  
  const tokenPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 7 // 7 days
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  
  const signature = crypto
    .createHmac("sha256", config.JWT_SECRET)
    .update(encodedHeader + "." + encodedPayload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
    
  return encodedHeader + "." + encodedPayload + "." + signature;
}

function verifyJWT(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  
  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", config.JWT_SECRET)
    .update(encodedHeader + "." + encodedPayload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
    
  if (signature !== expectedSig) return null;
  
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch (e) {
    return null;
  }
}

function authenticateUser(email, password) {
  const user = db.get("SELECT * FROM users WHERE email = ?", [email.toLowerCase().trim()]);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  
  const token = generateJWT({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  });
  
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    token
  };
}

function getUserFromToken(token) {
  const payload = verifyJWT(token);
  if (!payload) return null;
  return db.get("SELECT id, name, email, role FROM users WHERE id = ?", [payload.userId]);
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateJWT,
  verifyJWT,
  authenticateUser,
  getUserFromToken
};
