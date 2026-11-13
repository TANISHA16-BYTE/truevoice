// Unified Content Checking Pipeline
const crypto = require("crypto");
const { checkExactRules } = require("./exactRulesEngine");
const { checkTrademarks } = require("./trademarkShieldService");
const { checkRegionalNuances } = require("./regionalNuanceService");
const { checkScheduleClashes } = require("./scheduleClashService");
const { checkSemanticAI } = require("./aiCheckerService");
const { checkStaleSources } = require("./staleKnowledgeService");

async function runCheckPipeline(payload) {
  const {
    text = "",
    title = "Untitled Draft",
    channel = "General",
    scheduled_for = null,
    product_code = null,
    creator_id = "usr_creator_01"
  } = payload;

  const allFindings = [];

  // 1. Exact-match rules (Pricing, Claims, Offers, Terms, Tone 1.3)
  const exactFindings = checkExactRules(text, { product_code, channel });
  allFindings.push(...exactFindings);

  // 2. Trademark Shield ("check, don't judge")
  const trademarkFindings = checkTrademarks(text);
  allFindings.push(...trademarkFindings);

  // 3. Regional Nuance Guard (Slang, vernacular notes + learned mistake overrides)
  const regionalFindings = checkRegionalNuances(text);
  allFindings.push(...regionalFindings);

  // 4. Cross-Channel Schedule Clash Check
  const clashFindings = checkScheduleClashes({
    content: text,
    channel,
    scheduled_for,
    product_code
  });
  allFindings.push(...clashFindings);

    // 5. AI Semantic Judgment (Gemini or heuristic fallback)
  try {
    const aiFindings = await checkSemanticAI(text, allFindings);
    allFindings.push(...aiFindings);
  } catch (e) {
    console.warn("AI check failed, continuing without it:", e.message);
  }

  // 6. Stale Source Check: check if any cited source in findings is stale
  const staleSources = checkStaleSources();
  const staleMap = new Map(staleSources.filter(s => s.is_stale).map(s => [s.source_id, s]));

  for (const f of allFindings) {
    if (f.source_id && staleMap.has(f.source_id)) {
      const stale = staleMap.get(f.source_id);
      f.stale_warning = "Underlying source (" + stale.source_id + " - " + stale.title + ") expired on " + stale.last_verified_date + " and is pending review.";
    }
  }

  // Deduplicate findings by rule_ref and flagged_text
  const seen = new Set();
  const dedupedFindings = [];
  for (const f of allFindings) {
    const key = (f.rule_ref || "") + "::" + (f.flagged_text || "") + "::" + (f.type || "");
    if (!seen.has(key)) {
      seen.add(key);
      dedupedFindings.push({
        id: "fnd_" + crypto.randomBytes(4).toString("hex"),
        ...f,
        status: "pending",
        creator_explanation: null,
        dismiss_reason: null
      });
    }
  }

  // Compute Overall Risk Level
  let riskLevel = "LOW";
  const hasHigh = dedupedFindings.some(f => f.severity === "HIGH");
  const hasMedium = dedupedFindings.some(f => f.severity === "MEDIUM");

  if (hasHigh) {
    riskLevel = "HIGH";
  } else if (hasMedium || dedupedFindings.length >= 2) {
    riskLevel = "MEDIUM";
  }

  return {
    risk_level: riskLevel,
    findings_count: dedupedFindings.length,
    findings: dedupedFindings,
    summary: {
      high_severity_count: dedupedFindings.filter(f => f.severity === "HIGH").length,
      medium_severity_count: dedupedFindings.filter(f => f.severity === "MEDIUM").length,
      low_severity_count: dedupedFindings.filter(f => f.severity === "LOW").length,
      unverified_count: dedupedFindings.filter(f => f.type === "unverified_claim").length
    }
  };
}

module.exports = {
  runCheckPipeline
};
