// Library Controller (Inspection & Management of Approved Knowledge Base)
const db = require("../db/database");
const { checkStaleSources } = require("../services/staleKnowledgeService");

// NEW: facts get an owner and a status ("active" or "archived").
// This adds the two columns once, if they are missing. It is safe to run on every start.
function ensureFactColumns() {
  const columns = db.query("PRAGMA table_info(facts)").map((c) => c.name);
  if (!columns.includes("owner")) {
    db.exec("ALTER TABLE facts ADD COLUMN owner TEXT");
  }
  if (!columns.includes("status")) {
    db.exec("ALTER TABLE facts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  }
}
ensureFactColumns();

// NEW: only reviewers and admins may change the library.
const EDITOR_ROLES = ["reviewer", "admin"];

function requireEditor(user) {
  if (!user) {
    return { status: 401, data: { error: "Login required." } };
  }
  if (!EDITOR_ROLES.includes(user.role)) {
    return { status: 403, data: { error: "Only reviewers and admins can change the library." } };
  }
  return null;
}

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// "No source, no fact": a fact may only cite a source that exists in the sources table.
function sourceExists(sourceId) {
  return Boolean(db.get("SELECT source_id FROM sources WHERE source_id = ?", [sourceId]));
}

function nextFactId() {
  const rows = db.query("SELECT fact_id FROM facts");
  let max = 0;
  for (const row of rows) {
    const match = /^F-(\d+)$/.exec(row.fact_id);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return "F-" + String(max + 1).padStart(2, "0");
}

function getSources() {
  const sources = checkStaleSources();
  return { status: 200, data: { sources } };
}

// CHANGED: archived facts are hidden unless you ask for them with ?status=all
function getFacts(query = {}) {
  const facts =
    query.status === "all"
      ? db.query("SELECT * FROM facts ORDER BY product_code ASC, fact_id ASC")
      : db.query("SELECT * FROM facts WHERE status = 'active' ORDER BY product_code ASC, fact_id ASC");
  return { status: 200, data: { facts } };
}

// NEW: add a fact
function createFact(body, user) {
  const denied = requireEditor(user);
  if (denied) return denied;

  const productCode = cleanText(body && body.product_code, 40);
  const factKey = cleanText(body && body.fact_key, 80);
  const factValue = cleanText(body && body.fact_value, 300);
  const sourceId = cleanText(body && body.source_id, 40);

  if (!productCode || !factKey || !factValue) {
    return { status: 400, data: { error: "product_code, fact_key and fact_value are required." } };
  }
  if (!sourceId) {
    return { status: 400, data: { error: "source_id is required. No source, no fact." } };
  }
  if (!sourceExists(sourceId)) {
    return { status: 400, data: { error: "Unknown source_id: " + sourceId } };
  }

  const factId = nextFactId();
  const owner = cleanText(body && body.owner, 80) || user.name || user.id || "unknown";

  db.run(
    "INSERT INTO facts (fact_id, product_code, fact_key, fact_value, source_id, verified_date, owner, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')",
    [factId, productCode, factKey, factValue, sourceId, today(), owner]
  );

  return { status: 201, data: { fact: db.get("SELECT * FROM facts WHERE fact_id = ?", [factId]) } };
}

// NEW: edit a fact (only the fields you send are changed; "last checked" is updated)
function updateFact(factId, body, user) {
  const denied = requireEditor(user);
  if (denied) return denied;

  const existing = db.get("SELECT * FROM facts WHERE fact_id = ?", [factId]);
  if (!existing) {
    return { status: 404, data: { error: "Fact " + factId + " not found." } };
  }
  if (existing.status === "archived") {
    return { status: 409, data: { error: "Fact " + factId + " is archived and cannot be edited." } };
  }

  const next = {
    product_code: existing.product_code,
    fact_key: existing.fact_key,
    fact_value: existing.fact_value,
    source_id: existing.source_id,
    owner: existing.owner
  };
  const limits = { product_code: 40, fact_key: 80, fact_value: 300, source_id: 40, owner: 80 };

  for (const field of Object.keys(limits)) {
    if (body && body[field] !== undefined) {
      const value = cleanText(body[field], limits[field]);
      if (!value) {
        return { status: 400, data: { error: field + " cannot be empty." } };
      }
      next[field] = value;
    }
  }

  if (!next.source_id || !sourceExists(next.source_id)) {
    return { status: 400, data: { error: "Unknown source_id: " + next.source_id } };
  }

  db.run(
    "UPDATE facts SET product_code = ?, fact_key = ?, fact_value = ?, source_id = ?, owner = ?, verified_date = ? WHERE fact_id = ?",
    [next.product_code, next.fact_key, next.fact_value, next.source_id, next.owner || null, today(), factId]
  );

  return { status: 200, data: { fact: db.get("SELECT * FROM facts WHERE fact_id = ?", [factId]) } };
}

// NEW: archive a fact (it is hidden, not deleted, so the history stays)
function archiveFact(factId, user) {
  const denied = requireEditor(user);
  if (denied) return denied;

  const existing = db.get("SELECT * FROM facts WHERE fact_id = ?", [factId]);
  if (!existing) {
    return { status: 404, data: { error: "Fact " + factId + " not found." } };
  }

  db.run("UPDATE facts SET status = 'archived' WHERE fact_id = ?", [factId]);
  return { status: 200, data: { fact: db.get("SELECT * FROM facts WHERE fact_id = ?", [factId]) } };
}

function getPrices() {
  const prices = db.query("SELECT * FROM prices ORDER BY current_price_inr DESC");
  return { status: 200, data: { prices } };
}

function getOffers() {
  const offers = db.query("SELECT * FROM offers ORDER BY status ASC");
  return { status: 200, data: { offers } };
}

function getClaims() {
  const claims = db.query("SELECT * FROM claims ORDER BY status ASC");
  return { status: 200, data: { claims } };
}

function getTerms() {
  const terms = db.query("SELECT * FROM terms ORDER BY category ASC");
  return { status: 200, data: { terms } };
}

function getRules() {
  const rules = db.query("SELECT * FROM rules ORDER BY rule_id ASC");
  return { status: 200, data: { rules } };
}

function getProtectedNames() {
  const protectedNames = db.query("SELECT * FROM protected_names");
  return { status: 200, data: { protected_names: protectedNames } };
}

function getRegionalNotes() {
  const regionalNotes = db.query("SELECT * FROM regional_notes");
  return { status: 200, data: { regional_notes: regionalNotes } };
}

module.exports = {
  getSources,
  getFacts,
  createFact,
  updateFact,
  archiveFact,
  getPrices,
  getOffers,
  getClaims,
  getTerms,
  getRules,
  getProtectedNames,
  getRegionalNotes
};
