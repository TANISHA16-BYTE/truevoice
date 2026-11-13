// Proof-of-Approval Badge & Public Verification Service (Cryptographic SHA-256)
const crypto = require("crypto");
const db = require("../db/database");
const config = require("../config");

function normalizeContent(text) {
  // Normalize whitespace and line breaks for canonical hashing
  return text.trim().replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");
}

function computeContentHash(content) {
  const canonical = normalizeContent(content);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function createApprovalBadge({ draftId, content, approvedBy, reviewerName }) {
  const contentHash = computeContentHash(content);
  const badgeCode = "TV-APPR-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const approvedAt = new Date().toISOString();
  const publicUrl = config.BASE_URL + "/verify/" + badgeCode;
  const id = "badge_" + Date.now();
  
  db.run(
    "INSERT INTO approval_badges (id, draft_id, badge_code, content_hash, approved_by, reviewer_name, approved_at, public_url, is_revoked, snapshot_content, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
    [
      id,
      draftId,
      badgeCode,
      contentHash,
      approvedBy,
      reviewerName,
      approvedAt,
      publicUrl,
      content,
      JSON.stringify({ algorithm: "SHA-256", generator: "TrueVoice Trust Engine v1.0" })
    ]
  );
  
  return {
    id,
    badge_code: badgeCode,
    content_hash: contentHash,
    approved_by: approvedBy,
    reviewer_name: reviewerName,
    approved_at: approvedAt,
    public_url: publicUrl,
    snapshot_content: content
  };
}

function verifyBadgeAndContent(badgeCode, submittedContent = null) {
  const badge = db.get("SELECT * FROM approval_badges WHERE badge_code = ?", [badgeCode.trim().toUpperCase()]);
  if (!badge) {
    return {
      found: false,
      message: "No approval record found for badge code " + badgeCode + "."
    };
  }
  
  if (badge.is_revoked === 1) {
    return {
      found: true,
      is_revoked: true,
      message: "This approval badge has been revoked.",
      approved_at: badge.approved_at,
      reviewer_name: badge.reviewer_name
    };
  }
  
  const result = {
    found: true,
    badge_code: badge.badge_code,
    approved_by: badge.approved_by,
    reviewer_name: badge.reviewer_name,
    approved_at: badge.approved_at,
    content_hash: badge.content_hash,
    public_url: badge.public_url,
    original_approved_content: badge.snapshot_content
  };
  
  if (submittedContent !== null && submittedContent !== undefined) {
    const submittedHash = computeContentHash(submittedContent);
    const matches = submittedHash === badge.content_hash;
    
    result.submitted_content_verification = {
      matches,
      submitted_hash: submittedHash,
      status: matches ? "VERIFIED_AUTHENTIC" : "MODIFIED_TAMPERED",
      warning: matches ? null : "WARNING: Content has been changed since approval! The text does not match the signed record."
    };
  }
  
  return result;
}

module.exports = {
  normalizeContent,
  computeContentHash,
  createApprovalBadge,
  verifyBadgeAndContent
};
