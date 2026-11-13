// Check Controller (Instant Content Analysis & Multi-Channel Batch Scanning)
const { runCheckPipeline } = require("../services/checkPipeline");

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
async function checkBatch(body, user) {
  const { drafts = [] } = body || {};
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return { status: 400, data: { error: "Array of drafts is required for batch check." } };
  }

  const batchResults = [];
  const datesSeen = new Map();
  const pricesSeen = new Map();
  const crossChannelClashes = [];

  for (const d of drafts) {
    const res = await runCheckPipeline({
      text: d.content || d.text || "",
      title: d.title || "Untitled",
      channel: d.channel || "General",
      scheduled_for: d.scheduled_for,
      product_code: d.product_code,
      creator_id: user ? user.id : "usr_creator_01"
    });

    batchResults.push({
      channel: d.channel,
      title: d.title,
      risk_level: res.risk_level,
      findings_count: res.findings_count,
      findings: res.findings
    });

    // Cross-channel date consistency in batch
    if (d.launch_date) {
      if (datesSeen.size > 0 && !datesSeen.has(d.launch_date)) {
        crossChannelClashes.push({
          type: "batch_date_clash",
          message: "Channel " + d.channel + " announces launch date " + d.launch_date + " which conflicts with another channel in this batch."
        });
      }
      datesSeen.set(d.launch_date, d.channel);
    }
    // Cross-channel price consistency per product in batch
    const batchText = d.content || d.text || "";
    const productKey = inferBatchProductKey(d, batchText);
    const batchPrice = extractBatchPrice(d, batchText);
    if (batchPrice !== null && Number.isFinite(batchPrice)) {
      if (pricesSeen.has(productKey)) {
        const prev = pricesSeen.get(productKey);
        if (prev.price !== batchPrice) {
          crossChannelClashes.push({
            type: "batch_price_clash",
            product_code: productKey,
            message: "Channel " + (d.channel || "General") + " quotes ₹" + batchPrice + " for " + productKey + ", which conflicts with ₹" + prev.price + " on " + prev.channel + "."
          });
        }
      } else {
        pricesSeen.set(productKey, { price: batchPrice, channel: d.channel || "General" });
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
