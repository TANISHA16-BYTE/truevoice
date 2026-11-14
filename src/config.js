const path = require("path");
const crypto = require("crypto");

if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
) {
  throw new Error(
    "JWT_SECRET must be configured with at least 32 characters in production."
  );
}

// Development secret is generated per server process.
// Configure JWT_SECRET in production.
const developmentSecret = crypto.randomBytes(32).toString("hex");

const config = {
  PORT: parseInt(process.env.PORT || "8000", 10),
  HOST: process.env.HOST || "0.0.0.0",
  DATABASE_PATH: process.env.DATABASE_PATH ||
    path.join(process.cwd(), "truevoice.db"),

  JWT_SECRET: process.env.JWT_SECRET || developmentSecret,

  DEMO_DATE: process.env.DEMO_DATE || "2026-11-13",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  BASE_URL: process.env.BASE_URL || "http://localhost:8000",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",

  DEMO_USERS: [
    {
      id: "usr_creator_01",
      name: "Tanisha Jain",
      email: "tanisha@glowvale.demo",
      password: "creator123",
      role: "creator"
    },
    {
      id: "usr_reviewer_01",
      name: "Riddhi Sharma",
      email: "riddhi@glowvale.demo",
      password: "reviewer123",
      role: "reviewer"
    },
    {
      id: "usr_admin_01",
      name: "DevVibe Lead",
      email: "manager@glowvale.demo",
      password: "admin123",
      role: "admin"
    }
  ]
};

module.exports = config;
