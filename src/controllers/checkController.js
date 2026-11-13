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
