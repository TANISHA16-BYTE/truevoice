// Regional Nuance Guard & "Report AI Mistake" Learning Loop
const crypto = require("crypto");
const db = require("../db/database");

function checkRegionalNuances(text) {
  const findings = [];
  const normalizedText = text.toLowerCase();

  // 1. Fetch learned corrections from ai_mistakes table
  const aiMistakes = db.query("SELECT * FROM ai_mistakes");
  const learnedAllowedPhrases = new Set(
    aiMistakes.map(m => m.phrase.toLowerCase().trim())
  );

  // 2. Fetch regional notes
  const regionalNotes = db.query("SELECT * FROM regional_notes");

  for (const rn of regionalNotes) {
    const phraseLower = rn.phrase.toLowerCase();

    if (normalizedText.includes(phraseLower)) {
      if (learnedAllowedPhrases.has(phraseLower)) {
        continue;
      }

      if (rn.allowed === 1) {
        continue;
      }

      findings.push({
        type: "regional_nuance",
        severity: "HIGH",
        flagged_text: rn.phrase,
        rule_ref: "Tone 1.2",
        source_id: "S-10",
        reason: "Regional nuance alert: " + JSON.stringify(rn.phrase) + " (" + rn.meaning + ") is prohibited under inclusive tone policy (" + rn.context + ").",
        suggested_fix: rn.suggested_action,
        confidence: 0.95
      });
    }
  }

  return findings;
}

// CHANGED: text is trimmed to a safe length, and reporting the same phrase for the same
// region again updates the earlier correction instead of adding a duplicate.
function reportAiMistake({ phrase, region, incorrect_flag, user_correction, reviewer_id }) {
  const cleanPhrase = String(phrase).trim().slice(0, 120);
  const cleanRegion = String(region || "India-North").trim().slice(0, 60);
  const cleanFlag = String(incorrect_flag || "Flagged as violation").trim().slice(0, 200);
  const cleanCorrection = String(user_correction).trim().slice(0, 300);
  const createdAt = new Date().toISOString();

  const existing = db.get(
    "SELECT id FROM ai_mistakes WHERE lower(phrase) = lower(?) AND region = ?",
    [cleanPhrase, cleanRegion]
  );

  if (existing) {
    db.run(
      "UPDATE ai_mistakes SET incorrect_flag = ?, user_correction = ?, reviewer_id = ?, created_at = ? WHERE id = ?",
      [cleanFlag, cleanCorrection, reviewer_id, createdAt, existing.id]
    );
    return {
      id: existing.id,
      phrase: cleanPhrase,
      region: cleanRegion,
      incorrect_flag: cleanFlag,
      user_correction: cleanCorrection,
      created_at: createdAt,
      updated_existing: true
    };
  }

  const id = "aim_" + Date.now() + "_" + crypto.randomBytes(2).toString("hex");
  db.run(
    "INSERT INTO ai_mistakes (id, phrase, region, incorrect_flag, user_correction, reviewer_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, cleanPhrase, cleanRegion, cleanFlag, cleanCorrection, reviewer_id, createdAt]
  );
  return {
    id,
    phrase: cleanPhrase,
    region: cleanRegion,
    incorrect_flag: cleanFlag,
    user_correction: cleanCorrection,
    created_at: createdAt,
    updated_existing: false
  };
}

function listAiMistakes() {
  return db.query("SELECT * FROM ai_mistakes ORDER BY created_at DESC");
}

// NEW: the most recent corrections, so the AI check can be shown them as examples.
function getLearnedCorrections(limit = 10) {
  return db.query(
    "SELECT phrase, region, incorrect_flag, user_correction FROM ai_mistakes ORDER BY created_at DESC LIMIT ?",
    [limit]
  );
}

module.exports = {
  checkRegionalNuances,
  reportAiMistake,
  listAiMistakes,
  getLearnedCorrections
};