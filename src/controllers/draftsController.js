// Drafts Controller (Review Queue, Human Decisions, Approval & History)
const crypto = require("crypto");
const db = require("../db/database");
const { runCheckPipeline } = require("../services/checkPipeline");
const { createApprovalBadge } = require("../services/approvalBadgeService");

// NEW: who is allowed to do what.
// - Any logged-in user can submit a draft.
// - Creators can explain, accept fixes and hand over only on THEIR OWN drafts.
// - Only reviewers and admins can dismiss a finding, request changes or approve.
const REVIEWER_ROLES = ["reviewer", "admin"];

function requireLogin(user) {
  if (!user) {
    return { status: 401, data: { error: "Login required." } };
  }
  return null;
}

function requireReviewer(user) {
  const noLogin = requireLogin(user);
  if (noLogin) return noLogin;
  if (!REVIEWER_ROLES.includes(user.role)) {
    return { status: 403, data: { error: "Only reviewers and admins can do this." } };
  }
  return null;
}

// A reviewer or admin can act on any draft. A creator can act only on their own draft.
function requireDraftAccess(user, draft) {
  const noLogin = requireLogin(user);
  if (noLogin) return noLogin;
  if (REVIEWER_ROLES.includes(user.role) || draft.creator_id === user.id) {
    return null;
  }
  return { status: 403, data: { error: "You can only do this on your own drafts." } };
}

function logHistory(draftId, actorId, actorName, action, details) {
  const id = "hist_" + crypto.randomBytes(4).toString("hex");
  db.run(
    "INSERT INTO draft_history (id, draft_id, actor_id, actor_name, action, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, draftId, actorId, actorName, action, details, new Date().toISOString()]
  );
}

async function createDraft(body, user) {
  const denied = requireLogin(user);
  if (denied) return denied;

  const { title = "Untitled Draft", content, channel = "General", scheduled_for = null, product_code = null } = body || {};
  if (!content) {
    return { status: 400, data: { error: "Draft content is required." } };
  }

  const creatorId = user.id;
  const creatorName = user.name;
  const draftId = "drf_" + crypto.randomBytes(4).toString("hex");
  const now = new Date().toISOString();

  // Run pipeline
  const checkResult = await runCheckPipeline({
    text: content,
    title,
    channel,
    scheduled_for,
    product_code,
    creator_id: creatorId
  });

  // Save Draft
  db.run(
    "INSERT INTO drafts (id, title, content, original_content, channel, scheduled_for, product_code, creator_id, status, risk_level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)",
    [draftId, title, content, content, channel, scheduled_for, product_code, creatorId, checkResult.risk_level, now, now]
  );

  // Save Findings
  for (const f of checkResult.findings) {
    db.run(
      "INSERT INTO findings (id, draft_id, type, severity, flagged_text, rule_ref, source_id, reason, suggested_fix, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
      [f.id, draftId, f.type, f.severity, f.flagged_text, f.rule_ref, f.source_id, f.reason, f.suggested_fix, f.confidence || 1.0, now]
    );
  }

  logHistory(draftId, creatorId, creatorName, "SUBMITTED", "Draft submitted with " + checkResult.findings.length + " findings. Risk level: " + checkResult.risk_level);

  return {
    status: 201,
    data: {
      draft_id: draftId,
      title,
      risk_level: checkResult.risk_level,
      findings_count: checkResult.findings.length,
      findings: checkResult.findings,
      summary: checkResult.summary
    }
  };
}

function listDrafts(query = {}) {
  const { status, risk_level, channel } = query;
  let sql = "SELECT * FROM drafts WHERE 1=1";
  const params = [];

  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (risk_level) {
    sql += " AND risk_level = ?";
    params.push(risk_level);
  }
  if (channel) {
    sql += " AND channel = ?";
    params.push(channel);
  }

  // Sort by risk priority: HIGH first, then MEDIUM, then LOW
  sql += " ORDER BY CASE risk_level WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END ASC, created_at DESC";

  const drafts = db.query(sql, params);

  const results = drafts.map(d => {
    const findingsCount = db.get("SELECT COUNT(*) as count FROM findings WHERE draft_id = ?", [d.id])?.count || 0;
    const highCount = db.get("SELECT COUNT(*) as count FROM findings WHERE draft_id = ? AND severity = 'HIGH'", [d.id])?.count || 0;
    return {
      ...d,
      total_findings: findingsCount,
      high_severity_findings: highCount
    };
  });

  return { status: 200, data: { drafts: results } };
}

function getDraftDetails(draftId) {
  const draft = db.get("SELECT * FROM drafts WHERE id = ?", [draftId]);
  if (!draft) {
    return { status: 404, data: { error: "Draft not found." } };
  }

  const findings = db.query("SELECT * FROM findings WHERE draft_id = ? ORDER BY CASE severity WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END ASC", [draftId]);
  const history = db.query("SELECT * FROM draft_history WHERE draft_id = ? ORDER BY timestamp ASC", [draftId]);
  const badge = db.get("SELECT * FROM approval_badges WHERE draft_id = ?", [draftId]);

  return {
    status: 200,
    data: {
      draft,
      findings,
      history,
      approval_badge: badge || null
    }
  };
}

// "Why flagged?": the creator gets ONE chance to explain a finding.
function explainFinding(draftId, findingId, body, user) {
  const noLogin = requireLogin(user);
  if (noLogin) return noLogin;

  const explanation = typeof (body && body.explanation) === "string" ? body.explanation.trim().slice(0, 500) : "";
  if (!explanation) {
    return { status: 400, data: { error: "Explanation text is required." } };
  }

  const draft = db.get("SELECT * FROM drafts WHERE id = ?", [draftId]);
  if (!draft) {
    return { status: 404, data: { error: "Draft not found." } };
  }
  const denied = requireDraftAccess(user, draft);
  if (denied) return denied;

  const finding = db.get("SELECT * FROM findings WHERE id = ? AND draft_id = ?", [findingId, draftId]);
  if (!finding) {
    return { status: 404, data: { error: "Finding not found for this draft." } };
  }

  // Finished findings cannot be explained any more.
  if (finding.status === "accepted" || finding.status === "dismissed") {
    return { status: 409, data: { error: "This finding is already " + finding.status + "." } };
  }

  // One-chance rule: a second explanation is refused, and the creator is sent to a human.
  if (finding.status === "explained" || finding.creator_explanation) {
    return {
      status: 409,
      data: {
        error: "You have already used your one chance to explain this finding. Hand it over to a human manager.",
        chances_left: 0,
        next_step: "handover"
      }
    };
  }

  db.run("UPDATE findings SET creator_explanation = ?, status = 'explained' WHERE id = ?", [explanation, findingId]);

  logHistory(draftId, user.id, user.name, "EXPLAINED_FINDING", "Creator explained finding " + findingId + ": " + explanation);

  return {
    status: 200,
    data: {
      success: true,
      finding_id: findingId,
      chances_left: 0,
      next_step: "handover",
      message: "Your context is recorded for the reviewer. You have no more chances to explain this finding. You can hand the draft over to a human manager."
    }
  };
}

function handoverToManager(draftId, body, user) {
  const noLogin = requireLogin(user);
  if (noLogin) return noLogin;

  const { reason = "Creator requested human review" } = body || {};
  const draft = db.get("SELECT * FROM drafts WHERE id = ?", [draftId]);
  if (!draft) {
    return { status: 404, data: { error: "Draft not found." } };
  }
  const denied = requireDraftAccess(user, draft);
  if (denied) return denied;

  db.run(
    "UPDATE drafts SET handover_to_manager = 1, manager_handover_reason = ?, status = 'in_review', updated_at = ? WHERE id = ?",
    [reason, new Date().toISOString(), draftId]
  );

  logHistory(draftId, user.id, user.name, "HANDOVER_TO_MANAGER", "Escalated to human reviewer: " + reason);

  return { status: 200, data: { success: true, message: "Draft handed over to human manager for final decision." } };
}

function dismissFinding(draftId, findingId, body, user) {
  const denied = requireReviewer(user);
  if (denied) return denied;

  const { reason } = body || {};
  if (!reason) {
    return { status: 400, data: { error: "A dismissal reason is required to maintain the audit trail." } };
  }

  const finding = db.get("SELECT * FROM findings WHERE id = ? AND draft_id = ?", [findingId, draftId]);
  if (!finding) {
    return { status: 404, data: { error: "Finding not found." } };
  }

  db.run("UPDATE findings SET status = 'dismissed', dismiss_reason = ? WHERE id = ?", [reason, findingId]);

  logHistory(draftId, user.id, user.name, "DISMISSED_FINDING", "Dismissed finding (" + (finding.rule_ref || "rule") + "): " + reason);

  return { status: 200, data: { success: true, message: "Finding dismissed with reason recorded." } };
}

async function acceptFindingFix(draftId, findingId, body, user) {
  const noLogin = requireLogin(user);
  if (noLogin) return noLogin;

  const finding = db.get("SELECT * FROM findings WHERE id = ? AND draft_id = ?", [findingId, draftId]);
  const draft = db.get("SELECT * FROM drafts WHERE id = ?", [draftId]);
  if (!finding || !draft) {
    return { status: 404, data: { error: "Finding or draft not found." } };
  }
  const denied = requireDraftAccess(user, draft);
  if (denied) return denied;

  const fix = body?.custom_fix || finding.suggested_fix;
  if (!fix) {
    return { status: 400, data: { error: "No suggested fix available to apply." } };
  }

  let newContent = draft.content;
  if (finding.flagged_text && newContent.includes(finding.flagged_text)) {
    newContent = newContent.replace(finding.flagged_text, fix);
  } else {
    newContent += " " + fix;
  }

  db.run("UPDATE drafts SET content = ?, updated_at = ? WHERE id = ?", [newContent, new Date().toISOString(), draftId]);
  db.run("UPDATE findings SET status = 'accepted' WHERE id = ?", [findingId]);

  logHistory(draftId, user.id, user.name, "ACCEPTED_FIX", "Applied fix for finding " + findingId + ": " + fix);

  return {
    status: 200,
    data: {
      success: true,
      updated_content: newContent,
      message: "Suggestion applied. Draft content updated."
    }
  };
}

function approveDraft(draftId, body, user) {
  const denied = requireReviewer(user);
  if (denied) return denied;

  const draft = db.get("SELECT * FROM drafts WHERE id = ?", [draftId]);
  if (!draft) {
    return { status: 404, data: { error: "Draft not found." } };
  }

  const reviewerId = user.id;
  const reviewerName = user.name;
  const now = new Date().toISOString();

  // Create Cryptographic Approval Badge
  const badge = createApprovalBadge({
    draftId,
    content: draft.content,
    approvedBy: reviewerId,
    reviewerName
  });

  db.run("UPDATE drafts SET status = 'approved', updated_at = ? WHERE id = ?", [now, draftId]);

  logHistory(draftId, reviewerId, reviewerName, "APPROVED", "Draft approved. Generated verification badge: " + badge.badge_code);

  return {
    status: 200,
    data: {
      success: true,
      message: "Draft officially approved.",
      badge
    }
  };
}

function requestChanges(draftId, body, user) {
  const denied = requireReviewer(user);
  if (denied) return denied;

  const { notes = "Please address flagged findings" } = body || {};
  const draft = db.get("SELECT * FROM drafts WHERE id = ?", [draftId]);
  if (!draft) {
    return { status: 404, data: { error: "Draft not found." } };
  }

  const now = new Date().toISOString();

  db.run("UPDATE drafts SET status = 'changes_requested', updated_at = ? WHERE id = ?", [now, draftId]);
  logHistory(draftId, user.id, user.name, "CHANGES_REQUESTED", notes);

  return { status: 200, data: { success: true, message: "Changes requested from creator.", notes } };
}

module.exports = {
  createDraft,
  listDrafts,
  getDraftDetails,
  explainFinding,
  handoverToManager,
  dismissFinding,
  acceptFindingFix,
  approveDraft,
  requestChanges
};