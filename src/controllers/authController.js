// Auth Controller
const { authenticateUser, getUserFromToken } = require("../services/authService");

function login(body) {
  const { email, password } = body || {};
  if (!email || !password) {
    return { status: 400, data: { error: "Email and password are required" } };
  }
  const result = authenticateUser(email, password);
  if (!result) {
    return { status: 401, data: { error: "Invalid credentials" } };
  }
  return { status: 200, data: result };
}

function getMe(user) {
  if (!user) {
    return { status: 401, data: { error: "Unauthorized" } };
  }
  return { status: 200, data: { user } };
}

module.exports = { login, getMe };
