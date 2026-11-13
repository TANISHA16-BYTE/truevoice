// AI Mistakes Controller ("Report AI Mistake" Learning Loop)
const { reportAiMistake, listAiMistakes } = require("../services/regionalNuanceService");

function submitAiMistake(body, user) {
  const { phrase, region, incorrect_flag, user_correction } = body || {};
  if (!phrase || !user_correction) {
    return { status: 400, data: { error: "Phrase and user correction are required." } };
  }
  
  const reviewerId = user ? user.id : "usr_reviewer_01";
  const result = reportAiMistake({
    phrase,
    region,
    incorrect_flag: incorrect_flag || "Flagged as violation",
    user_correction,
    reviewer_id: reviewerId
  });

  return { status: 201, data: { success: true, message: "AI Mistake recorded. System will use this as a learned correction.", mistake: result } };
}

function getMistakes() {
  const mistakes = listAiMistakes();
  return { status: 200, data: { mistakes } };
}

module.exports = { submitAiMistake, getMistakes };
