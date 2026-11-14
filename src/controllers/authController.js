// Auth Controller
const { authenticateUser, registerUser } = require("../services/authService");

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

function signup(body) {
  const { name, email, password } = body || {};

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return { status: 400, data: { error: "Name, email and password are required." } };
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (cleanName.length < 2 || cleanName.length > 80) {
    return { status: 400, data: { error: "Name must be between 2 and 80 characters." } };
  }

  if (cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { status: 400, data: { error: "Please enter a valid email address." } };
  }

  if (password.length < 8 || password.length > 128) {
    return { status: 400, data: { error: "Password must be between 8 and 128 characters." } };
  }

  const user = registerUser(cleanName, cleanEmail, password);

  if (!user) {
    return { status: 409, data: { error: "An account with this email already exists." } };
  }

  return {
    status: 201,
    data: {
      message: "Account created successfully.",
      user
    }
  };
}

function getMe(user) {
  if (!user) {
    return { status: 401, data: { error: "Unauthorized" } };
  }
  return { status: 200, data: { user } };
}

module.exports = { login, signup, getMe };
