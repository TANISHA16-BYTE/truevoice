// Drafts Controller — authenticated ownership and role-based review.
const crypto = require("crypto");
const db = require("../db/database");
const { runCheckPipeline } = require("../services/checkPipeline");
const { createApprovalBadge } = require("../services/approvalBadgeService");

const REVIEWER_ROLES = ["reviewer", "admin"];

function failure(status, error) {
  return { status, data: { error } };
}

function requireUser(user) {
  return user ? null : failure(401, "Authentication required.");
}

function requireCreator(user) {
  const auth = requireUser(user);
  if (auth) return auth;
  if (user.role !== "creator") {
    return failure(403, "Only creators can perform this action.");
  }
  return null;
}

function requireReviewer(user) {
  const auth = requireUser(user);
  if (auth) return auth;
  if (!REVIEWER_ROLES.includes(user.role)) {
    return failure(403, "Reviewer or admin permission required.");
  }
  return null;
}

function findAuthorizedDraft(draftId, user, allowedRoles) {
  const auth = requireUser(user);
  if (auth) return { error: auth };

  if (!allowedRoles.includes(user.role)) {
    return { error: failure(403, "You do not have permission for this action.") };
  }

  const draft = db.get("SELECT * FROM drafts WHERE id = ?", [draftId]);
  if (!draft) return { error: failure(404, "Draft not found.") };

  if (user.role === "creator" && draft.creator_id !== user.id) {
    return { error: failure(403, "You can only access your own drafts.") };
  }

  return { draft };
}

function logHistory(draftId, actorId, actorName, action, details) {
  const id = "hist_" + crypto.randomBytes(4).toString("hex");
  db.run(
    "INSERT INTO draft_history (id, draft_id, actor_id, actor_name, action, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, draftId, actorId, actorName, action, details, new Date().toISOString()]
  );
}

async function createDraft(body, user) {
  const denied = requireCreator(user);
  if (denied) return denied;

  const {
    title = "Untitled Draft",
    content,
    text,
    channel = "General",
    scheduled_for = null,
    product_code = null
  } = body || {};

  const draftContent =
    typeof content === "string" && content.trim() ? content : text;

  if (!draftContent || typeof draftContent !== "string" || !draftContent.trim()) {
    return failure(400, "Draft content is required.");
  }

  const creatorId = user.id;
  const creatorName = user.name;
  const draftId = "drf_" + crypto.randomBytes(4).toString("hex");
  const now = new Date().toISOString();

  const checkResult = await runCheckPipeline({
    text: draftContent,
    title,
    channel,
    scheduled_for,
    product_code,
    creator_id: creatorId
  });

  db.run(
    "INSERT INTO drafts (id, title, content, original_content, channel, scheduled_for, product_code, creator_id, status, risk_level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)",
    [draftId, title, draftContent, draftContent, channel, scheduled_for, product_code, creatorId, checkResult.risk_level, now, now]
  );

  for (const f of checkResult.findings) {
    db.run(
      "INSERT INTO findings (id, draft_id, type, severity, flagged_text, rule_ref, source_id, reason, suggested_fix, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
      [f.id, draftId, f.type, f.severity, f.flagged_text, f.rule_ref, f.source_id, f.reason, f.suggested_fix, f.confidence || 1.0, now]
    );
  }

  logHistory(
    draftId, creatorId, creatorName, "SUBMITTED",
    "Draft submitted with " + checkResult.findings.length +
    " findings. Risk level: " + checkResult.risk_level
  );

  return {
    status: 201,
    data: {
      id: draftId,
      draft_id: draftId,
      title,
      status: "submitted",
      risk_level: checkResult.risk_level,
      findings_count: checkResult.findings.length,
      findings: checkResult.findings,
      summary: checkResult.summary
    }
  };
}

function listDrafts(query = {}, user) {
  const auth = requireUser(user);
  if (auth) return auth;

  if (!["creator", ...REVIEWER_ROLES].includes(user.role)) {
    return failure(403, "You do not have permission to view drafts.");
  }

  const { status, risk_level, channel } = query;
  let sql = "SELECT * FROM drafts WHERE 1=1";
  const params = [];

  if (user.role === "creator") {
    sql += " AND creator_id = ?";
    params.push(user.id);
  }

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

  sql += " ORDER BY CASE risk_level WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END ASC, created_at DESC";

  const drafts = db.query(sql, params);
  const results = drafts.map(d => {
    const findingsCount = db.get(
      "SELECT COUNT(*) as count FROM findings WHERE draft_id = ?", [d.id]
    )?.count || 0;
    const highCount = db.get(
      "SELECT COUNT(*) as count FROM findings WHERE draft_id = ? AND severity = 'HIGH'", [d.id]
    )?.count || 0;

    return {
      ...d,
      total_findings: findingsCount,
      high_severity_findings: highCount
    };
  });

  return { status: 200, data: { drafts: results } };
}

function getDraftDetails(draftId, user) {
  const result = findAuthorizedDraft(
    draftId, user, ["creator", ...REVIEWER_ROLES]
  );
  if (result.error) return result.error;

  const findings = db.query(
    "SELECT * FROM findings WHERE draft_id = ? ORDER BY CASE severity WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END ASC",
    [draftId]
  );
  const history = db.query(
    "SELECT * FROM draft_history WHERE draft_id = ? ORDER BY timestamp ASC",
    [draftId]
  );
  const badge = db.get(
    "SELECT * FROM approval_badges WHERE draft_id = ? AND is_revoked = 0 ORDER BY approved_at DESC LIMIT 1",
    [draftId]
  );

  return {
    status: 200,
    data: { draft: result.draft, findings, history, approval_badge: badge || null }
  };
}

function explainFinding(draftId, findingId, body, user) {
  const access = findAuthorizedDraft(draftId, user, ["creator"]);
  if (access.error) return access.error;

  const explanation =
    typeof (body && body.explanation) === "string" ? body.explanation.trim().slice(0, 500) : "";
  if (!explanation) {
    return failure(400, "Explanation text is required.");
  }

  const finding = db.get(
    "SELECT * FROM findings WHERE id = ? AND draft_id = ?",
    [findingId, draftId]
  );
  if (!finding) return failure(404, "Finding not found for this draft.");

  // Finished findings cannot be explained any more.
  if (finding.status === "accepted" || finding.status === "dismissed") {
    return failure(409, "This finding is already " + finding.status + ".");
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

  db.run(
    "UPDATE findings SET creator_explanation = ?, status = 'explained' WHERE id = ?",
    [explanation, findingId]
  );

  logHistory(
    draftId, user.id, user.name, "EXPLAINED_FINDING",
    "Creator explained finding " + findingId + ": " + explanation
  );

  return {
    status: 200,
    data: {
      success: true,
      finding_id: findingId,
      chances_left: 0,
      next_step: "handover",
      message: "Context explanation recorded. You have no more chances to explain this finding. You can hand the draft over to a human manager."
    }
  };
}

function handoverToManager(draftId, body, user) {
  const access = findAuthorizedDraft(draftId, user, ["creator"]);
  if (access.error) return access.error;

  const { finding_id, explanation, reason } = body || {};

  // Support saving one-chance context explanation + escalating in a single call
  if (finding_id && typeof explanation === "string" && explanation.trim()) {
    const finding = db.get(
      "SELECT * FROM findings WHERE id = ? AND draft_id = ?",
      [finding_id, draftId]
    );
    if (!finding) return failure(404, "Finding not found for this draft.");
    if (finding.status === "accepted" || finding.status === "dismissed") {
      return failure(409, "This finding is already " + finding.status + ".");
    }
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

    const cleanExplanation = explanation.trim().slice(0, 500);
    db.run(
      "UPDATE findings SET creator_explanation = ?, status = 'explained' WHERE id = ?",
      [cleanExplanation, finding_id]
    );
    logHistory(
      draftId, user.id, user.name, "EXPLAINED_FINDING",
      "Creator explained finding " + finding_id + ": " + cleanExplanation
    );
  }

  const handoverReason =
    (typeof reason === "string" && reason.trim()) ||
    (typeof explanation === "string" && explanation.trim()) ||
    "Creator requested human review";

  db.run(
    "UPDATE drafts SET handover_to_manager = 1, manager_handover_reason = ?, status = 'in_review', updated_at = ? WHERE id = ?",
    [handoverReason, new Date().toISOString(), draftId]
  );

  logHistory(
    draftId, user.id, user.name, "HANDOVER_TO_MANAGER",
    "Escalated to human reviewer: " + handoverReason
  );

  return {
    status: 200,
    data: {
      success: true,
      handover_to_manager: 1,
      message: "Draft handed over to human manager for final decision."
    }
  };
}

function dismissFinding(draftId, findingId, body, user) {
  const access = findAuthorizedDraft(draftId, user, REVIEWER_ROLES);
  if (access.error) return access.error;

  const { reason } = body || {};
  if (!reason) {
    return failure(400, "A dismissal reason is required to maintain the audit trail.");
  }

  const finding = db.get(
    "SELECT * FROM findings WHERE id = ? AND draft_id = ?",
    [findingId, draftId]
  );
  if (!finding) return failure(404, "Finding not found.");

  db.run(
    "UPDATE findings SET status = 'dismissed', dismiss_reason = ? WHERE id = ?",
    [reason, findingId]
  );

  logHistory(
    draftId, user.id, user.name, "DISMISSED_FINDING",
    "Dismissed finding (" + (finding.rule_ref || "rule") + "): " + reason
  );

  return { status: 200, data: { success: true, message: "Finding dismissed with reason recorded." } };
}

async function acceptFindingFix(draftId, findingId, body, user) {
  const access = findAuthorizedDraft(draftId, user, ["creator"]);
  if (access.error) return access.error;

  const draft = access.draft;
  const finding = db.get(
    "SELECT * FROM findings WHERE id = ? AND draft_id = ?",
    [findingId, draftId]
  );
  if (!finding) return failure(404, "Finding not found for this draft.");

  const fix = body?.custom_fix || finding.suggested_fix;
  if (!fix) return failure(400, "No suggested fix available to apply.");

  let newContent = draft.content;
  if (finding.flagged_text && newContent.includes(finding.flagged_text)) {
    newContent = newContent.replace(finding.flagged_text, fix);
  } else {
    newContent += " " + fix;
  }

  db.run(
    "UPDATE drafts SET content = ?, updated_at = ? WHERE id = ?",
    [newContent, new Date().toISOString(), draftId]
  );
  db.run("UPDATE findings SET status = 'accepted' WHERE id = ?", [findingId]);

  logHistory(
    draftId, user.id, user.name, "ACCEPTED_FIX",
    "Applied fix for finding " + findingId + ": " + fix
  );

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
  const access = findAuthorizedDraft(draftId, user, REVIEWER_ROLES);
  if (access.error) return access.error;

  const draft = access.draft;

  // Prevent generating multiple approval badges for the same draft.
  const existingBadge = db.get(
    "SELECT * FROM approval_badges WHERE draft_id = ? AND is_revoked = 0 ORDER BY approved_at DESC LIMIT 1",
    [draftId]
  );

  if (existingBadge) {
    return {
      status: 409,
      data: {
        success: false,
        status: "already_approved",
        message: "This draft already has an approval badge. A second badge cannot be generated.",
        badge: existingBadge
      }
    };
  }

  const now = new Date().toISOString();
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  const badge = createApprovalBadge({
    draftId,
    content: draft.content,
    approvedBy: user.id,
    reviewerName: user.name
  });

  db.run(
    "UPDATE drafts SET status = 'approved', updated_at = ? WHERE id = ?",
    [now, draftId]
  );

  logHistory(
    draftId,
    user.id,
    user.name,
    "APPROVED",
    "Draft approved. Generated verification badge: " +
      badge.badge_code +
      (note ? " | Note: " + note : "")
  );

  return {
    status: 200,
    data: {
      success: true,
      status: "approved",
      message: "Draft officially approved.",
      badge
    }
  };
}

function requestChanges(draftId, body, user) {
  const access = findAuthorizedDraft(draftId, user, REVIEWER_ROLES);
  if (access.error) return access.error;

  const notes =
    (typeof body?.notes === "string" && body.notes.trim()) ||
    (typeof body?.note === "string" && body.note.trim()) ||
    "Please address flagged findings";
  const now = new Date().toISOString();

  const activeBadges = db.query(
    "SELECT badge_code FROM approval_badges WHERE draft_id = ? AND is_revoked = 0",
    [draftId]
  );

  if (activeBadges.length > 0) {
    db.run(
      "UPDATE approval_badges SET is_revoked = 1 WHERE draft_id = ? AND is_revoked = 0",
      [draftId]
    );
    for (const b of activeBadges) {
      logHistory(
        draftId,
        user.id,
        user.name,
        "APPROVAL_REVOKED",
        `Revoked approval badge ${b.badge_code}: ${notes}`
      );
    }
  }

  db.run(
    "UPDATE drafts SET status = 'changes_requested', updated_at = ? WHERE id = ?",
    [now, draftId]
  );
  logHistory(draftId, user.id, user.name, "CHANGES_REQUESTED", notes);

  return {
    status: 200,
    data: {
      success: true,
      status: "changes_requested",
      revoked_badges: activeBadges.map((b) => b.badge_code),
      message:
        activeBadges.length > 0
          ? "Approval revoked and changes requested from creator."
          : "Changes requested from creator.",
      notes
    }
  };
}

function decideDraft(draftId, body, user) {
  const action = String(body?.action || "").trim().toLowerCase();
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (action === "approve" || action === "approved") {
    return approveDraft(draftId, { note }, user);
  }
  if (
    action === "request_changes" ||
    action === "changes_requested" ||
    action === "request changes"
  ) {
    return requestChanges(draftId, { notes: note || "Please address flagged findings" }, user);
  }

  return failure(400, "Invalid action. Use 'approved' or 'changes_requested'.");
}
async function resubmitDraft(draftId, body, user) {
  const access = findAuthorizedDraft(draftId, user, ["creator"]);
  if (access.error) return access.error;

  const existing = access.draft;
  const existingBadge = db.get(
    "SELECT id FROM approval_badges WHERE draft_id = ? AND is_revoked = 0 LIMIT 1",
    [draftId]
  );
  if (existing.status === "approved" || existingBadge) {
    return failure(409, "Approved drafts cannot be edited. Submit a new draft instead.");
  }

  const {
    title,
    content,
    text,
    channel,
    scheduled_for,
    product_code
  } = body || {};

  const draftContent =
    typeof content === "string" && content.trim() ? content : text;

  if (!draftContent || typeof draftContent !== "string" || !draftContent.trim()) {
    return failure(400, "Draft content is required.");
  }

  const nextTitle =
    typeof title === "string" && title.trim() ? title.trim() : existing.title;
  const nextChannel =
    typeof channel === "string" && channel.trim() ? channel.trim() : existing.channel;
  const nextScheduledFor =
    scheduled_for !== undefined ? scheduled_for : existing.scheduled_for;
  const nextProductCode =
    product_code !== undefined ? product_code : existing.product_code;

  const now = new Date().toISOString();
  const checkResult = await runCheckPipeline({
    text: draftContent,
    title: nextTitle,
    channel: nextChannel,
    scheduled_for: nextScheduledFor,
    product_code: nextProductCode,
    creator_id: user.id
  });

  db.run(
    "UPDATE drafts SET title = ?, content = ?, channel = ?, scheduled_for = ?, product_code = ?, status = 'submitted', risk_level = ?, handover_to_manager = 0, manager_handover_reason = NULL, updated_at = ? WHERE id = ?",
    [
      nextTitle,
      draftContent,
      nextChannel,
      nextScheduledFor,
      nextProductCode,
      checkResult.risk_level,
      now,
      draftId
    ]
  );

  db.run("DELETE FROM findings WHERE draft_id = ?", [draftId]);

  for (const f of checkResult.findings) {
    db.run(
      "INSERT INTO findings (id, draft_id, type, severity, flagged_text, rule_ref, source_id, reason, suggested_fix, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
      [
        f.id,
        draftId,
        f.type,
        f.severity,
        f.flagged_text,
        f.rule_ref,
        f.source_id,
        f.reason,
        f.suggested_fix,
        f.confidence || 1.0,
        now
      ]
    );
  }

  logHistory(
    draftId,
    user.id,
    user.name,
    "RESUBMITTED",
    "Draft edited and resubmitted with " +
      checkResult.findings.length +
      " findings. Risk level: " +
      checkResult.risk_level
  );

  return {
    status: 200,
    data: {
      id: draftId,
      draft_id: draftId,
      title: nextTitle,
      channel: nextChannel,
      status: "submitted",
      risk_level: checkResult.risk_level,
      findings_count: checkResult.findings.length,
      findings: checkResult.findings,
      summary: checkResult.summary
    }
  };
}
module.exports = {
  createDraft,
  listDrafts,
  getDraftDetails,
  resubmitDraft,
  explainFinding,
  handoverToManager,
  dismissFinding,
  acceptFindingFix,
  approveDraft,
  requestChanges,
  decideDraft
};