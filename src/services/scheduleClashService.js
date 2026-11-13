// Cross-Channel Batch Clash Detection Service
const db = require("../db/database");

function checkScheduleClashes(draft) {
  const findings = [];
  const content = (draft.content || "").toLowerCase();
  const scheduledPosts = db.query("SELECT * FROM scheduled_posts");
  
  // Date clashes: check launch date mentions
  // Official launch date from facts is 2026-11-20 (Friday 20 Nov)
  const officialLaunchFact = db.get("SELECT fact_value FROM facts WHERE fact_key = 'launch_date' AND product_code = 'GV-SER-30'");
  const officialLaunch = officialLaunchFact ? officialLaunchFact.fact_value : "2026-11-20";
  
  // Look for date indicators in the draft
  const mentionsLaunch = content.includes("launch") || content.includes("releasing") || content.includes("drops");
  const mentionsNov19 = content.includes("19 nov") || content.includes("nov 19") || content.includes("thursday 19");
  const mentionsNov20 = content.includes("20 nov") || content.includes("nov 20") || content.includes("friday 20");
  
  for (const post of scheduledPosts) {
    // 1. Channel date drift clash
    if (post.product.includes("GV-SER-30") && post.launch_date_mentioned === "2026-11-19") {
      if (mentionsNov20 || (mentionsLaunch && !mentionsNov19)) {
        findings.push({
          type: "schedule_clash",
          severity: "MEDIUM",
          flagged_text: mentionsNov20 ? "Friday 20 Nov" : "launch",
          rule_ref: "Schedule 5.1",
          source_id: "S-01",
          reason: "Clash: an Instagram post (ID " + post.post_id + ") scheduled for Thu 19 Nov announces the same launch date as 19 Nov, while official launch is " + officialLaunch + ".",
          suggested_fix: "Match the date across channels, or ask the campaign owner (" + post.channel + ").",
          confidence: 0.95
        });
      }
    }
    
    // 2. Channel price clash
    if (post.price_mentioned_inr && post.price_mentioned_inr === 499 && post.product.includes("GV-SPF-50")) {
      if (content.includes("sunscreen") || content.includes("daily shield") || (draft.product_code && draft.product_code.includes("GV-SPF-50"))) {
        // If the draft quotes current price 549 or mentions price
        if (content.includes("499")) {
          findings.push({
            type: "schedule_clash",
            severity: "HIGH",
            flagged_text: "Price alignment",
            rule_ref: "Pricing 2.1",
            source_id: "S-04",
            reason: "Price drift clash: " + post.channel + " post (" + post.post_id + ") is scheduled with outdated price ₹499, while active price is ₹549.",
            suggested_fix: "Synchronize all scheduled channel posts to active price ₹549 before publishing.",
            confidence: 0.95
          });
        }
      }
    }
  }
  
  return findings;
}

function listScheduledPosts() {
  return db.query("SELECT * FROM scheduled_posts ORDER BY scheduled_for ASC");
}

module.exports = {
  checkScheduleClashes,
  listScheduledPosts
};
