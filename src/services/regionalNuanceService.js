// Regional Nuance Guard & "Report AI Mistake" Learning Loop
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

function reportAiMistake({ phrase, region, incorrect_flag, user_correction, reviewer_id }) {
  const id = "aim_" + Date.now();
  const createdAt = new Date().toISOString();
  db.run(
    "INSERT INTO ai_mistakes (id, phrase, region, incorrect_flag, user_correction, reviewer_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, phrase.trim(), region || "India-North", incorrect_flag, user_correction, reviewer_id, createdAt]
  );
  return { id, phrase, region, incorrect_flag, user_correction, created_at: createdAt };
}

function listAiMistakes() {
  return db.query("SELECT * FROM ai_mistakes ORDER BY created_at DESC");
}

module.exports = {
  checkRegionalNuances,
  reportAiMistake,
  listAiMistakes
};
