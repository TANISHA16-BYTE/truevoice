// Trademark Shield Service ("Check, don't judge" protection)
const db = require("../db/database");

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1).toLowerCase() === a.charAt(j - 1).toLowerCase()) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function checkTrademarks(text) {
  const findings = [];
  const protectedItems = db.query("SELECT * FROM protected_names");
  const normalizedText = text.toLowerCase();
  
  // Extract words and 2-word n-grams
  const words = text.split(/[\s,.;!?]+/);
  const phrases = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i]) phrases.push(words[i]);
    if (i < words.length - 1 && words[i] && words[i + 1]) {
      phrases.push(words[i] + " " + words[i + 1]);
    }
  }
  
  for (const item of protectedItems) {
    const targetName = item.name.toLowerCase();
    const lookalikes = (item.lookalike_keywords || "")
      .split(",")
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);
    lookalikes.push(targetName);
    
    let matched = false;
    let detectedWord = "";
    
    // 1. Direct or lookalike substring match
    for (const kw of lookalikes) {
      if (normalizedText.includes(kw)) {
        matched = true;
        detectedWord = kw;
        break;
      }
    }
    
    // 2. Fuzzy match on phrases/tokens
    if (!matched) {
      for (const phrase of phrases) {
        const pNorm = phrase.toLowerCase();
        if (pNorm.length >= 4) {
          const dist = levenshteinDistance(pNorm, targetName);
          const maxLen = Math.max(pNorm.length, targetName.length);
          const similarity = 1 - (dist / maxLen);
          if (similarity >= 0.75) {
            matched = true;
            detectedWord = phrase;
            break;
          }
        }
      }
    }
    
    if (matched) {
      findings.push({
        type: "trademark_warning",
        severity: "MEDIUM",
        flagged_text: detectedWord,
        rule_ref: "Naming 4.1",
        source_id: "S-09",
        reason: "Heads up: this sounds similar to " + item.name + " (" + item.owner + "). This is an AI suggestion, not legal advice. Please consult your legal team.",
        suggested_fix: "Verify non-infringement with Legal Team or choose distinct name",
        confidence: 0.90
      });
    }
  }
  
  return findings;
}

module.exports = {
  checkTrademarks
};
