// Guideline Health Score Service — calculated from real review activity.
const db = require("../db/database");

function calculateGuidelineHealth() {
  const rules = db.query(
    "SELECT rule_id, title, section, text FROM rules ORDER BY rule_id ASC"
  );

  const findings = db.query(
    "SELECT rule_ref, status, COUNT(*) AS count " +
    "FROM findings WHERE rule_ref IS NOT NULL " +
    "GROUP BY rule_ref, status"
  );

  const stats = new Map();

  for (const rule of rules) {
    stats.set(rule.rule_id, {
      rule_ref: rule.rule_id,
      title: rule.title || "Guideline Rule",
      section: rule.section || "Compliance",
      current_wording: rule.text || null,
      total_flagged: 0,
      dismissed_or_overridden: 0,
      accepted: 0,
      pending: 0
    });
  }

  // Preserve statistics for findings whose rule is no longer in the rules table.
  for (const finding of findings) {
    if (!stats.has(finding.rule_ref)) {
      stats.set(finding.rule_ref, {
        rule_ref: finding.rule_ref,
        title: "Guideline Rule",
        section: "Compliance",
        current_wording: null,
        total_flagged: 0,
        dismissed_or_overridden: 0,
        accepted: 0,
        pending: 0
      });
    }

    const item = stats.get(finding.rule_ref);
    const count = Number(finding.count) || 0;

    item.total_flagged += count;

    if (finding.status === "dismissed") {
      item.dismissed_or_overridden += count;
    } else if (finding.status === "accepted") {
      item.accepted += count;
    } else {
      item.pending += count;
    }
  }

  const analysis = [];

  for (const item of stats.values()) {
    const overrideRate = item.total_flagged
      ? item.dismissed_or_overridden / item.total_flagged
      : 0;

    const isUnclear = item.total_flagged >= 5 && overrideRate >= 0.40;

    let suggestion = "Rule is working effectively with the recorded review activity.";

    if (item.total_flagged === 0) {
      suggestion = "Not enough review activity yet to evaluate this rule.";
    } else if (overrideRate >= 0.50) {
      suggestion =
        "Frequently overridden. Add concrete on-brand examples and clearer preferred wording.";
    } else if (overrideRate >= 0.30) {
      suggestion =
        "Moderate review friction observed. Consider adding clearer examples and safe alternatives.";
    }

    analysis.push({
      rule_ref: item.rule_ref,
      title: item.title,
      section: item.section,
      current_wording: item.current_wording,
      total_flagged: item.total_flagged,
      override_count: item.dismissed_or_overridden,
      accepted_count: item.accepted,
      pending_count: item.pending,
      override_rate_pct: Math.round(overrideRate * 100),
      is_unclear: isUnclear,
      suggested_action: suggestion
    });
  }

  analysis.sort((a, b) => b.total_flagged - a.total_flagged);

  const totalFlagged = analysis.reduce(
    (sum, item) => sum + item.total_flagged,
    0
  );
  const totalOverrides = analysis.reduce(
    (sum, item) => sum + item.override_count,
    0
  );
  const problematicRulesCount = analysis.filter(
    item => item.is_unclear
  ).length;

  // Weighted by actual findings, not by fabricated demo values.
  const overallOverrideRate = totalFlagged
    ? totalOverrides / totalFlagged
    : 0;

  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(100 - overallOverrideRate * 80 - problematicRulesCount * 5)
    )
  );

  return {
    health_score: healthScore,
    status:
      totalFlagged < 5
        ? "INSUFFICIENT_DATA"
        : healthScore >= 75
          ? "HEALTHY"
          : healthScore >= 50
            ? "NEEDS_ATTENTION"
            : "AT_RISK",
    has_sufficient_data: totalFlagged >= 5,
    total_findings: totalFlagged,
    total_overrides: totalOverrides,
    problematic_rules_count: problematicRulesCount,
    most_flagged_rules: analysis
      .filter(item => item.total_flagged > 0)
      .slice(0, 5),
    unclear_rules_alert: analysis.filter(item => item.is_unclear),
    calculated_at: new Date().toISOString()
  };
}

module.exports = { calculateGuidelineHealth };
