// TrueVoice System Configuration
const path = require("path");

const config = {
  PORT: parseInt(process.env.PORT || "8000", 10),
  HOST: process.env.HOST || "0.0.0.0",
  DATABASE_PATH: process.env.DATABASE_PATH || path.join(process.cwd(), "truevoice.db"),
  JWT_SECRET: process.env.JWT_SECRET || "truevoice-devvibe-hackathon-jwt-secret-2026",
  DEMO_DATE: process.env.DEMO_DATE || "2026-11-13",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  BASE_URL: process.env.BASE_URL || "http://localhost:8000",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  
  // Default Demo Users for hackathon presentations
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
