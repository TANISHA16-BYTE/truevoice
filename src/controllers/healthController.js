// Guideline Health Controller
const { calculateGuidelineHealth } = require("../services/guidelineHealthService");

async function getGuidelineHealth() {
  const healthData = await calculateGuidelineHealth();
  return { status: 200, data: healthData };
}

module.exports = { getGuidelineHealth };
