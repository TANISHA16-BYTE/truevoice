// Guideline Health Controller
const { calculateGuidelineHealth } = require("../services/guidelineHealthService");

function getGuidelineHealth() {
  const healthData = calculateGuidelineHealth();
  return { status: 200, data: healthData };
}

module.exports = { getGuidelineHealth };
