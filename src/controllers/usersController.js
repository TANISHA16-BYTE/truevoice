// Admin Team & Role Management Controller (PostgreSQL + SQLite async adapter)
const crypto = require("node:crypto");
const db = require("../db/database");
const { hashPassword } = require("../services/authService");

const ALLOWED_ROLES = ["creator", "reviewer", "admin"];

function requireAdmin(user) {
  if (!user) {
    return { status: 401, data: { error: "Authentication required." } };
  }
  if (String(user.role || "").toLowerCase() !== "admin") {
    return { status: 403, data: { error: "Admin permission required." } };
  }
  return null;
}

async function listUsers(currentUser) {
  const denied = requireAdmin(currentUser);
  if (denied) return denied;

  const users = await db.query(
    `SELECT id, name, email, role, created_at
     FROM users
     ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END, created_at DESC`
  );
  return { status: 200, data: { users } };
}

async function updateUserRole(targetUserId, body, currentUser) {
  const denied = requireAdmin(currentUser);
  if (denied) return denied;

  const nextRole = typeof body?.role === "string" ? body.role.trim().toLowerCase() : "";
  if (!ALLOWED_ROLES.includes(nextRole)) {
    return {
      status: 400,
      data: { error: "Role must be one of: creator, reviewer, admin." }
    };
  }

  const target = await db.get(
    "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
    [targetUserId]
  );
  if (!target) {
    return { status: 404, data: { error: "User not found." } };
  }

  if (target.id === currentUser.id && nextRole !== "admin") {
    return {
      status: 400,
      data: { error: "You cannot demote your own admin account." }
    };
  }

  await db.run("UPDATE users SET role = ? WHERE id = ?", [nextRole, target.id]);
  const updated = await db.get(
    "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
    [target.id]
  );

  return {
    status: 200,
    data: {
      success: true,
      message: `${updated.name}'s role updated to ${updated.role}.`,
      user: updated
    }
  };
}

async function createTeamUser(body, currentUser) {
  const denied = requireAdmin(currentUser);
  if (denied) return denied;

  const { name, email, password, role = "creator" } = body || {};
  if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
    return { status: 400, data: { error: "Name, email, and password are required." } };
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanRole = typeof role === "string" ? role.trim().toLowerCase() : "creator";

  if (cleanName.length < 2 || cleanName.length > 80) {
    return { status: 400, data: { error: "Name must be between 2 and 80 characters." } };
  }
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { status: 400, data: { error: "Please enter a valid email address." } };
  }
  if (password.length < 8 || password.length > 128) {
    return { status: 400, data: { error: "Password must be between 8 and 128 characters." } };
  }
  if (!ALLOWED_ROLES.includes(cleanRole)) {
    return { status: 400, data: { error: "Role must be one of: creator, reviewer, admin." } };
  }

  const existing = await db.get("SELECT id FROM users WHERE email = ?", [cleanEmail]);
  if (existing) {
    return { status: 409, data: { error: "An account with this email already exists." } };
  }

  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const createdAt = new Date().toISOString();

  try {
    await db.run(
      "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, cleanName, cleanEmail, passwordHash, cleanRole, createdAt]
    );
  } catch (error) {
    if ((error.code === "ERR_SQLITE_ERROR" || error.code === "23505") && /unique|constraint|duplicate/i.test(error.message)) {
      return { status: 409, data: { error: "An account with this email already exists." } };
    }
    throw error;
  }

  const created = await db.get(
    "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
    [id]
  );

  return {
    status: 201,
    data: {
      success: true,
      message: `${created.name} onboarded as ${created.role}.`,
      user: created
    }
  };
}

module.exports = {
  listUsers,
  updateUserRole,
  createTeamUser
};
