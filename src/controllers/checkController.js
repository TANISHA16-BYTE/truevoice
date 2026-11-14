// Check Controller (Instant Content Analysis & Multi-Channel Batch Scanning)
const { runCheckPipeline } = require("../services/checkPipeline");
const config = require("../config");

async function checkContent(body, user) {
  const { text, title, channel, scheduled_for, product_code } = body || {};
  if (!text || typeof text !== "string") {
    return { status: 400, data: { error: "Valid text is required to run checks." } };
  }

  const result = await runCheckPipeline({
    text,
    title,
    channel,
    scheduled_for,
    product_code,
    creator_id: user ? user.id : "usr_creator_01"
  });

  return { status: 200, data: result };
}

function inferBatchProductKey(draft, text) {
  if (draft.product_code) return draft.product_code;
  const lower = text.toLowerCase();
  if (lower.includes("hydra glow") || lower.includes("serum") || lower.includes("gv-ser-30")) return "GV-SER-30";
  if (lower.includes("daily shield") || lower.includes("sunscreen") || lower.includes("gv-spf-50")) return "GV-SPF-50";
  if (lower.includes("gentle foam") || lower.includes("cleanser") || lower.includes("gv-cln-100")) return "GV-CLN-100";
  return "DEFAULT";
}

function extractBatchPrice(draft, text) {
  if (draft.price_inr !== undefined && draft.price_inr !== null) return Number(draft.price_inr);
  if (draft.price !== undefined && draft.price !== null) return Number(draft.price);
  const match =
    text.match(/(?:₹|inr\s*|rs\.?\s*)(\d{2,5})\b/i) ||
    text.match(/\b(\d{2,5})\s*(?:rs\.?|inr)\b/i) ||
    text.match(/\b(?:for|at|priced at)\s+(\d{3,5})\b(?!\s*(?:ml|g|mg|%|nov|dec|volunteers|days))/i);
  return match ? parseInt(match[1], 10) : null;
}

// ---------------------------------------------------------------
// NEW: find the launch date inside the draft text (so the caller
// does not have to send a separate launch_date field).
// ---------------------------------------------------------------
const MONTHS = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", sept: "09", september: "09",
  oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12"
};
const MONTH_PATTERN =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const LAUNCH_WORDS = /\b(launch(?:ing|es|ed)?|releas(?:e|es|ing)|drops?|goes live|arriv(?:e|es|ing)|available from|available on)\b/gi;

// Returns the first date found in a piece of text, as YYYY-MM-DD, or null.
function findFirstDate(text, defaultYear) {
  const found = [];

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) found.push({ index: iso.index, iso: iso[1] + "-" + iso[2] + "-" + iso[3] });

  const dmy = new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+" + MONTH_PATTERN + "(?:\\s+(\\d{4}))?\\b", "i").exec(text);
  if (dmy) {
    found.push({
      index: dmy.index,
      iso: (dmy[3] || defaultYear) + "-" + MONTHS[dmy[2].toLowerCase()] + "-" + dmy[1].padStart(2, "0")
    });
  }

  const mdy = new RegExp("\\b" + MONTH_PATTERN + "\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b", "i").exec(text);
  if (mdy) {
    found.push({
      index: mdy.index,
      iso: (mdy[3] || defaultYear) + "-" + MONTHS[mdy[1].toLowerCase()] + "-" + mdy[2].padStart(2, "0")
    });
  }

  if (found.length === 0) return null;
  found.sort((a, b) => a.index - b.index);
  return found[0].iso;
}

// Looks for a launch word ("launching", "drops", ...) and returns the date written next to it.
// A date far from any launch word (for example an offer's end date) is ignored.
function detectLaunchDate(text) {
  const defaultYear = String(config.DEMO_DATE || "2026-11-13").slice(0, 4);
  LAUNCH_WORDS.lastIndex = 0;
  let match;
  while ((match = LAUNCH_WORDS.exec(text)) !== null) {
    const start = Math.max(0, match.index - 40);
    const end = Math.min(text.length, match.index + match[0].length + 60);
    const date = findFirstDate(text.slice(start, end), defaultYear);
    if (date) return date;
  }
  return null;
}

async function checkBatch(body, user) {
  const { drafts = [] } = body || {};
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return { status: 400, data: { error: "Array of drafts is required for batch check." } };
  }

  const batchResults = [];
  const datesSeen = new Map(); // product -> { date, channel } of the first draft that named a date
  const pricesSeen = new Map(); // product -> { price, channel } of the first draft that quoted a price
  const crossChannelClashes = [];

  for (const d of drafts) {
    const batchText = d.content || d.text || "";
    const channelName = d.channel || "General";
    const productKey = inferBatchProductKey(d, batchText);

    const res = await runCheckPipeline({
      text: batchText,
      title: d.title || "Untitled",
      channel: channelName,
      scheduled_for: d.scheduled_for,
      product_code: d.product_code,
      creator_id: user ? user.id : "usr_creator_01"
    });

    // CHANGED: use the launch_date field if it is sent, otherwise read it from the text.
    const launchDate = d.launch_date || detectLaunchDate(batchText);

    batchResults.push({
      channel: d.channel,
      title: d.title,
      risk_level: res.risk_level,
      findings_count: res.findings_count,
      findings: res.findings,
      detected_launch_date: launchDate || null
    });

    // Cross-channel launch-date consistency, per product
    if (launchDate) {
      const seen = datesSeen.get(productKey);
      if (!seen) {
        datesSeen.set(productKey, { date: launchDate, channel: channelName });
      } else if (seen.date !== launchDate) {
        crossChannelClashes.push({
          type: "batch_date_clash",
          severity: "MEDIUM",
          product_code: productKey,
          channels: [seen.channel, channelName],
          dates: [seen.date, launchDate],
          message:
            "Channel " + channelName + " announces launch date " + launchDate +
            " which conflicts with " + seen.channel + " (" + seen.date + ") in this batch.",
          suggested_fix: "Use one launch date across all channels, or ask the campaign owner."
        });
      }
    }

    // Cross-channel price consistency, per product.
    // Skipped when the product is unknown, or for bundles (they have their own price).
    const isBundle = batchText.toLowerCase().includes("bundle");
    const batchPrice = extractBatchPrice(d, batchText);
    if (productKey !== "DEFAULT" && !isBundle && batchPrice !== null && Number.isFinite(batchPrice)) {
      const seen = pricesSeen.get(productKey);
      if (!seen) {
        pricesSeen.set(productKey, { price: batchPrice, channel: channelName });
      } else if (seen.price !== batchPrice) {
        crossChannelClashes.push({
          type: "batch_price_clash",
          severity: "HIGH",
          product_code: productKey,
          channels: [seen.channel, channelName],
          prices: [seen.price, batchPrice],
          message:
            "Channel " + channelName + " quotes ₹" + batchPrice + " for " + productKey +
            ", which conflicts with ₹" + seen.price + " on " + seen.channel + ".",
          suggested_fix: "Use the current approved price on every channel."
        });
      }
    }
  }

  return {
    status: 200,
    data: {
      total_drafts_analyzed: drafts.length,
      cross_channel_clashes: crossChannelClashes,
      batch_results: batchResults
    }
  };
}

module.exports = { checkContent, checkBatch };