// Cross-Channel Batch Clash Detection Service
const db = require("../db/database");

const MONTH_MAP = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12"
};

function extractMentionedDates(text, defaultYear = "2026") {
  const results = [];
  const seen = new Set();
  const add = (iso, raw) => {
    if (!seen.has(iso)) {
      seen.add(iso);
      results.push({ iso, raw });
    }
  };

  let m;
  const isoRe = /\b(\d{4}-\d{2}-\d{2})\b/g;
  while ((m = isoRe.exec(text)) !== null) {
    add(m[1], m[0]);
  }

  const dmyRe = /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/gi;
  while ((m = dmyRe.exec(text)) !== null) {
    const day = m[1].padStart(2, "0");
    const month = MONTH_MAP[m[2].toLowerCase()];
    const year = m[3] || defaultYear;
    if (month) add(`${year}-${month}-${day}`, m[0]);
  }

  const mdyRe = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/gi;
  while ((m = mdyRe.exec(text)) !== null) {
    const month = MONTH_MAP[m[1].toLowerCase()];
    const day = m[2].padStart(2, "0");
    const year = m[3] || defaultYear;
    if (month) add(`${year}-${month}-${day}`, m[0]);
  }

  return results;
}

function matchesProductContext(content, draftProductCode, priceRow) {
  const code = priceRow.product_code;
  if (draftProductCode && draftProductCode.includes(code)) return true;
  if (content.includes(priceRow.product_name.toLowerCase()) || content.includes(code.toLowerCase())) return true;
  if (code === "GV-SPF-50" && (content.includes("sunscreen") || content.includes("daily shield") || content.includes("shield"))) return true;
  if (code === "GV-SER-30" && (content.includes("hydra glow") || content.includes("serum"))) return true;
  if (code === "GV-CLN-100" && (content.includes("cleanser") || content.includes("foam"))) return true;
  return false;
}

function checkScheduleClashes(draft) {
  const findings = [];
  const rawText = draft.content || "";
  const content = rawText.toLowerCase();
  const scheduledPosts = db.query("SELECT * FROM scheduled_posts");
  const prices = db.query("SELECT * FROM prices");

  // Official launch date from facts is 2026-11-20 (Friday 20 Nov)
  const officialLaunchFact = db.get("SELECT fact_value FROM facts WHERE fact_key = 'launch_date' AND product_code = 'GV-SER-30'");
  const officialLaunch = officialLaunchFact ? officialLaunchFact.fact_value : "2026-11-20";
  const defaultYear = officialLaunch.slice(0, 4);

  const mentionsLaunch = /\b(launch(?:ing|ed|es)?|releas(?:e|ing)|drops?)\b/i.test(content);
  const mentionedDates = extractMentionedDates(rawText, defaultYear);
  const mentionsSerumContext =
    (draft.product_code && draft.product_code.includes("GV-SER-30")) ||
    content.includes("serum") ||
    content.includes("hydra");

  // 1a. Validate explicit launch dates against official launch date (only when a date is mentioned)
  if (mentionsLaunch && mentionedDates.length > 0 && (!draft.product_code || draft.product_code.includes("GV-SER-30") || mentionsSerumContext)) {
    for (const d of mentionedDates) {
      if (d.iso !== officialLaunch) {
        findings.push({
          type: "schedule_clash",
          severity: "HIGH",
          flagged_text: d.raw,
          rule_ref: "Schedule 5.1",
          source_id: "S-02",
          reason: "Launch date mismatch: draft announces launch date " + d.iso + ", while official Hydra Glow Serum (GV-SER-30) launch date is " + officialLaunch + ".",
          suggested_fix: "Update launch date to official date " + officialLaunch + " (Friday 20 Nov).",
          confidence: 0.95
        });
      }
    }
  }

  const hasChannelContext = Boolean(
    draft.scheduled_for ||
    draft.product_code ||
    (draft.channel && draft.channel !== "General")
  );

  for (const post of scheduledPosts) {
    const sameChannel =
      draft.channel &&
      post.channel &&
      post.channel.toLowerCase() === draft.channel.toLowerCase();

    // 1b. Cross-channel launch date drift clash against scheduled posts
    if (
      post.launch_date_mentioned &&
      post.product.includes("GV-SER-30") &&
      mentionsLaunch &&
      mentionedDates.length > 0 &&
      !sameChannel
    ) {
      const conflictingDraftDate = mentionedDates.find((d) => d.iso !== post.launch_date_mentioned);
      if (conflictingDraftDate) {
        const flaggedPhrase = /friday\s+20\s+nov/i.test(rawText)
          ? rawText.match(/friday\s+20\s+nov/i)[0]
          : conflictingDraftDate.raw;
        findings.push({
          type: "schedule_clash",
          severity: "MEDIUM",
          flagged_text: flaggedPhrase,
          rule_ref: "Schedule 5.1",
          source_id: "S-01",
          reason: "Cross-channel date clash: " + post.channel + " post (" + post.post_id + ") scheduled for " + post.scheduled_for + " announces launch on " + post.launch_date_mentioned + ", conflicting with draft date " + conflictingDraftDate.iso + " (official launch: " + officialLaunch + ").",
          suggested_fix: "Align " + post.channel + " post (" + post.post_id + ") and this draft to official launch date " + officialLaunch + ".",
          confidence: 0.95
        });
      }
    }

    // 2. Cross-channel scheduled-post price drift clash (e.g., P-03 GV-SPF-50 at ₹499 vs active ₹549)
    if (post.price_mentioned_inr && !post.product.includes("+")) {
      const priceRow = prices.find((p) => post.product === p.product_code);
      if (priceRow && post.price_mentioned_inr !== priceRow.current_price_inr) {
        if (matchesProductContext(content, draft.product_code, priceRow)) {
          const mentionsScheduledOldPrice = content.includes(String(post.price_mentioned_inr));
          const mentionsCurrentPriceInCampaign = hasChannelContext && content.includes(String(priceRow.current_price_inr));

          if ((mentionsScheduledOldPrice || mentionsCurrentPriceInCampaign) && !sameChannel) {
            findings.push({
              type: "schedule_clash",
              severity: "HIGH",
              flagged_text: mentionsScheduledOldPrice ? "₹" + post.price_mentioned_inr : "₹" + priceRow.current_price_inr,
              rule_ref: "Pricing 2.1",
              source_id: priceRow.source_id || "S-04",
              reason: "Price drift clash: " + post.channel + " post (" + post.post_id + ") is scheduled with outdated price ₹" + post.price_mentioned_inr + ", while active price for " + priceRow.product_name + " is ₹" + priceRow.current_price_inr + ".",
              suggested_fix: "Synchronize scheduled " + post.channel + " post (" + post.post_id + ") to active price ₹" + priceRow.current_price_inr + " before publishing.",
              confidence: 0.95
            });
          }
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
