// Badge Controller (Public Verification & Tamper Detection)
const { verifyBadgeAndContent } = require("../services/approvalBadgeService");

function getBadgeVerification(badgeCode) {
  const result = verifyBadgeAndContent(badgeCode);
  return { status: result.found ? 200 : 404, data: result };
}

function verifyContentIntegrity(body) {
  const { badge_code, content } = body || {};
  if (!badge_code) {
    return { status: 400, data: { error: "Badge code is required." } };
  }
  const result = verifyBadgeAndContent(badge_code, content);
  return { status: result.found ? 200 : 404, data: result };
}

module.exports = {
  getBadgeVerification,
  verifyContentIntegrity
};
