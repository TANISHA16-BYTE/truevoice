// AI Mistakes Controller ("Report AI Mistake" Learning Loop)
const { reportAiMistake, listAiMistakes } = require("../services/regionalNuanceService");

// NEW: only reviewers and admins (the local reviewers in the plan) can correct the AI.
const REVIEWER_ROLES = ["reviewer", "admin"];

function submitAiMistake(body, user) {
  if (!user) {
    return { status: 401, data: { error: "Login required." } };
  }
  if (!REVIEWER_ROLES.includes(user.role)) {
    return { status: 403, data: { error: "Only reviewers and admins can report an AI mistake." } };
  }

  const { phrase, region, incorrect_flag, user_correction } = body || {};
  if (
    typeof phrase !== "string" || !phrase.trim() ||
    typeof user_correction !== "string" || !user_correction.trim()
  ) {
    return { status: 400, data: { error: "Phrase and user correction are required." } };
  }

  const result = reportAiMistake({
    phrase,
    region: typeof region === "string" ? region : undefined,
    incorrect_flag: typeof incorrect_flag === "string" ? incorrect_flag : undefined,
    user_correction,
    reviewer_id: user.id
  });

  return {
    status: 201,
    data: {
      success: true,
      message: "AI Mistake recorded. System will use this as a learned correction.",
      mistake: result
    }
  };
}

function getMistakes() {
  const mistakes = listAiMistakes();
  return { status: 200, data: { mistakes } };
}

module.exports = { submitAiMistake, getMistakes };