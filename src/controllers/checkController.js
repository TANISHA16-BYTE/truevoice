// Check Controller (Instant Content Analysis)
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

module.exports = { checkContent };
