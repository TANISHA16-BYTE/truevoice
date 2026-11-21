// Badge Controller (Public Verification & Tamper Detection)
const { verifyBadgeAndContent } = require("../services/approvalBadgeService");

async function getBadgeVerification(badgeCode) {
  const result = await verifyBadgeAndContent(badgeCode);
  return { status: result.found ? 200 : 404, data: result };
}

async function verifyContentIntegrity(body) {
  const { badge_code, content } = body || {};
  if (!badge_code) {
    return { status: 400, data: { error: "Badge code is required." } };
  }
  const result = await verifyBadgeAndContent(badge_code, content);
  return { status: result.found ? 200 : 404, data: result };
}

module.exports = {
  getBadgeVerification,
  verifyContentIntegrity
};
