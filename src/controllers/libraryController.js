// Library Controller (Inspection & Management of Approved Knowledge Base)
const db = require("../db/database");
const { checkStaleSources } = require("../services/staleKnowledgeService");

// The extra columns (owner, status, archived, last_checked) are added in src/db/database.js.

// Only reviewers and admins may change the library.
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

// "No source, no fact": a cited source must exist in the sources table.
async async function sourceExists(sourceId) {
  return Boolean(await db.get("SELECT source_id FROM sources WHERE source_id = ?", [sourceId]));
}

async async function ruleExists(ruleId) {
  return Boolean(await db.get("SELECT rule_id FROM rules WHERE rule_id = ?", [ruleId]));
}

// ---------------------------------------------------------------
// FACTS (add, edit, archive)
// ---------------------------------------------------------------
async async function nextFactId() {
  const rows = await db.query("SELECT fact_id FROM facts");
  let max = 0;
  for (const row of rows) {
    const match = /^F-(\d+)$/.exec(row.fact_id);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return "F-" + String(max + 1).padStart(2, "0");
}

async async function getSources() {
  const sources = await checkStaleSources();
  return { status: 200, data: { sources } };
}

// Archived facts are hidden unless you ask for them with ?status=all
async async function getFacts(query = {}) {
  const facts =
    query.status === "all"
      ? await db.query("SELECT * FROM facts ORDER BY product_code ASC, fact_id ASC")
      : await db.query("SELECT * FROM facts WHERE status = 'active' ORDER BY product_code ASC, fact_id ASC");
  return { status: 200, data: { facts } };
}

async async function createFact(body, user) {
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
  if (!(await sourceExists(sourceId)))) {
    return { status: 400, data: { error: "Unknown source_id: " + sourceId } };
  }

  const factId = await nextFactId();
  const owner = cleanText(body && body.owner, 80) || user.name || user.id || "unknown";

  await db.run(
    "INSERT INTO facts (fact_id, product_code, fact_key, fact_value, source_id, verified_date, owner, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')",
    [factId, productCode, factKey, factValue, sourceId, today(), owner]
  );

  return { status: 201, data: { fact: await db.get("SELECT * FROM facts WHERE fact_id = ?", [factId]) } };
}

async async function updateFact(factId, body, user) {
  const denied = requireEditor(user);
  if (denied) return denied;

  const existing = await db.get("SELECT * FROM facts WHERE fact_id = ?", [factId]);
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

  if (!next.source_id || !(await sourceExists(next.source_id)))) {
    return { status: 400, data: { error: "Unknown source_id: " + next.source_id } };
  }

  await db.run(
    "UPDATE facts SET product_code = ?, fact_key = ?, fact_value = ?, source_id = ?, owner = ?, verified_date = ? WHERE fact_id = ?",
    [next.product_code, next.fact_key, next.fact_value, next.source_id, next.owner || null, today(), factId]
  );

  return { status: 200, data: { fact: await db.get("SELECT * FROM facts WHERE fact_id = ?", [factId]) } };
}

async async function archiveFact(factId, user) {
  const denied = requireEditor(user);
  if (denied) return denied;

  const existing = await db.get("SELECT * FROM facts WHERE fact_id = ?", [factId]);
  if (!existing) {
    return { status: 404, data: { error: "Fact " + factId + " not found." } };
  }

  await db.run("UPDATE facts SET status = 'archived' WHERE fact_id = ?", [factId]);
  return { status: 200, data: { fact: await db.get("SELECT * FROM facts WHERE fact_id = ?", [factId]) } };
}

// ---------------------------------------------------------------
// PRICES, OFFERS, CLAIMS, TERMS (add, edit, archive)
// One shared set of functions, with one description per kind.
// ---------------------------------------------------------------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const KINDS = {
  prices: {
    singular: "price",
    table: "prices",
    idColumn: "price_id",
    prefix: "PR",
    orderBy: "current_price_inr DESC",
    fields: {
      product_code: { type: "text", max: 40, required: true },
      product_name: { type: "text", max: 80, required: true },
      current_price_inr: { type: "int", min: 1, required: true },
      old_price_inr: { type: "int", min: 0, required: false },
      effective_date: { type: "date", required: false, default: today },
      source_id: { type: "source", required: true }
    },
    async async check(values, selfId) {
      const clash = await db.get(
        "SELECT price_id FROM prices WHERE product_code = ? AND archived = 0 AND price_id != ?",
        [values.product_code, selfId]
      );
      if (clash) {
        return "An active price for " + values.product_code + " already exists (" + clash.price_id + "). Edit it instead.";
      }
      return null;
    },
    onUpdate(existing, body, values) {
      if (body.current_price_inr !== undefined && values.current_price_inr !== existing.current_price_inr) {
        if (body.old_price_inr === undefined) values.old_price_inr = existing.current_price_inr;
        if (body.effective_date === undefined) values.effective_date = today();
      }
    }
  },

  offers: {
    singular: "offer",
    table: "offers",
    idColumn: "offer_id",
    prefix: "OFF",
    orderBy: "status ASC, offer_id ASC",
    fields: {
      code: { type: "text", max: 40, required: true, upper: true },
      title: { type: "text", max: 120, required: true },
      discount_pct: { type: "int", min: 0, max: 100, required: true },
      applies_to: { type: "text", max: 80, required: true },
      valid_from: { type: "date", required: true },
      valid_to: { type: "date", required: true },
      max_discount_inr: { type: "int", min: 0, required: false },
      status: { type: "enum", options: ["active", "expired"], required: false, default: "active" }
    },
    async check(values, selfId) {
      if (values.valid_from > values.valid_to) {
        return "valid_from must not be after valid_to.";
      }
      const clash = await db.get(
        "SELECT offer_id FROM offers WHERE code = ? AND archived = 0 AND offer_id != ?",
        [values.code, selfId]
      );
      if (clash) {
        return "An active offer with code " + values.code + " already exists (" + clash.offer_id + ").";
      }
      return null;
    }
  },

  claims: {
    singular: "claim",
    table: "claims",
    idColumn: "claim_id",
    prefix: "C",
    orderBy: "status ASC, claim_id ASC",
    fields: {
      claim_text: { type: "text", max: 300, required: true },
      status: { type: "claimStatus", required: true },
      applies_to: { type: "text", max: 80, required: true },
      required_evidence: { type: "text", max: 300, required: false },
      source_id: { type: "source", required: false },
      rule_ref: { type: "rule", required: false },
      safe_alternative: { type: "text", max: 300, required: false }
    },
    check(values) {
      if (values.status.startsWith("approved") && !values.source_id) {
        return "An approved claim needs a source_id. No source, no approved claim.";
      }
      return null;
    }
  },

  terms: {
    singular: "term",
    table: "terms",
    idColumn: "term_id",
    prefix: "T",
    orderBy: "category ASC, term_id ASC",
    fields: {
      term: { type: "text", max: 120, required: true },
      category: { type: "enum", options: ["banned", "retired"], required: true },
      replacement: { type: "text", max: 200, required: true },
      reason: { type: "text", max: 300, required: true },
      rule_ref: { type: "rule", required: true }
    }
  }
};

function readField(name, spec, raw) {
  if (typeof raw === "string") raw = raw.trim();

  if (raw === undefined || raw === null || raw === "") {
    if (spec.required) return { error: name + " is required." };
    const fallback = typeof spec.default === "function" ? spec.default() : spec.default;
    return { value: fallback !== undefined ? fallback : null };
  }

  switch (spec.type) {
    case "text": {
      const value = typeof raw === "string" ? raw.slice(0, spec.max) : "";
      if (!value) return { error: name + " must be text." };
      return { value: spec.upper ? value.toUpperCase() : value };
    }
    case "int": {
      const n = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
      const max = spec.max !== undefined ? spec.max : Infinity;
      if (!Number.isInteger(n) || n < spec.min || n > max) {
        const range = spec.max !== undefined ? " from " + spec.min + " to " + spec.max : " of at least " + spec.min;
        return { error: name + " must be a whole number" + range + "." };
      }
      return { value: n };
    }
    case "date": {
      if (typeof raw !== "string" || !DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) {
        return { error: name + " must be a date like 2026-11-20." };
      }
      return { value: raw };
    }
    case "enum": {
      if (!spec.options.includes(raw)) {
        return { error: name + " must be one of: " + spec.options.join(", ") + "." };
      }
      return { value: raw };
    }
    case "claimStatus": {
      if (typeof raw !== "string" || !/^(approved|restricted|prohibited)/.test(raw)) {
        return { error: name + " must start with approved, restricted or prohibited." };
      }
      return { value: raw.slice(0, 120) };
    }
    case "source": {
      if (typeof raw !== "string" || !sourceExists(raw))) {
        return { error: "Unknown source_id: " + raw };
      }
      return { value: raw };
    }
    case "rule": {
      if (typeof raw !== "string" || !ruleExists(raw))) {
        return { error: "Unknown rule_ref: " + raw + ". See GET /api/library/rules for valid ones." };
      }
      return { value: raw };
    }
    default:
      return { error: name + " has an unsupported type." };
  }
}

async async function nextId(def) {
  const rows = await db.query("SELECT " + def.idColumn + " AS id FROM " + def.table);
  const pattern = new RegExp("^" + def.prefix + "-(\\d+)$");
  let max = 0;
  for (const row of rows) {
    const match = pattern.exec(row.id);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return def.prefix + "-" + String(max + 1).padStart(2, "0");
}

async async function listKind(kind, query = {}) {
  const def = KINDS[kind];
  const where = query.status === "all" ? "" : " WHERE archived = 0";
  const items = await db.query("SELECT * FROM " + def.table + where + " ORDER BY " + def.orderBy);
  return { status: 200, data: { [def.table]: items } };
}

async async function createItem(kind, body, user) {
  const denied = requireEditor(user);
  if (denied) return denied;

  const def = KINDS[kind];
  if (!def) return { status: 404, data: { error: "Unknown library item type." } };

  const values = {};
  for (const [name, spec] of Object.entries(def.fields)) {
    const result = readField(name, spec, body ? body[name] : undefined);
    if (result.error) return { status: 400, data: { error: result.error } };
    values[name] = result.value;
  }

  const problem = def.check ? def.check(values, "") : null;
  if (problem) return { status: 400, data: { error: problem } };

  const id = await nextId(def);
  const owner = cleanText(body && body.owner, 80) || user.name || user.id || "unknown";
  const names = Object.keys(def.fields);
  const columns = [def.idColumn, ...names, "owner", "last_checked"];
  const params = [id, ...names.map((n) => values[n]), owner, today()];

  await db.run(
    "INSERT INTO " + def.table + " (" + columns.join(", ") + ") VALUES (" + columns.map(() => "?").join(", ") + ")",
    params
  );

  const row = await db.get("SELECT * FROM " + def.table + " WHERE " + def.idColumn + " = ?", [id]);
  return { status: 201, data: { [def.singular]: row } };
}

async async function updateItem(kind, itemId, body, user) {
  const denied = requireEditor(user);
  if (denied) return denied;

  const def = KINDS[kind];
  if (!def) return { status: 404, data: { error: "Unknown library item type." } };

  const existing = await db.get("SELECT * FROM " + def.table + " WHERE " + def.idColumn + " = ?", [itemId]);
  if (!existing) return { status: 404, data: { error: itemId + " not found." } };
  if (existing.archived === 1) {
    return { status: 409, data: { error: itemId + " is archived and cannot be edited." } };
  }

  const values = {};
  for (const [name, spec] of Object.entries(def.fields)) {
    if (body && body[name] !== undefined) {
      const result = readField(name, spec, body[name]);
      if (result.error) return { status: 400, data: { error: result.error } };
      values[name] = result.value;
    } else {
      values[name] = existing[name];
    }
  }

  if (def.onUpdate) def.onUpdate(existing, body || {}, values);

  const problem = def.check ? def.check(values, itemId) : null;
  if (problem) return { status: 400, data: { error: problem } };

  const owner = body && body.owner !== undefined ? cleanText(body.owner, 80) || existing.owner : existing.owner;
  const names = Object.keys(def.fields);
  const setClause = [...names, "owner", "last_checked"].map((c) => c + " = ?").join(", ");
  const params = [...names.map((n) => values[n]), owner || null, today(), itemId];

  await db.run("UPDATE " + def.table + " SET " + setClause + " WHERE " + def.idColumn + " = ?", params);

  const row = await db.get("SELECT * FROM " + def.table + " WHERE " + def.idColumn + " = ?", [itemId]);
  return { status: 200, data: { [def.singular]: row } };
}

async async function archiveItem(kind, itemId, user) {
  const denied = requireEditor(user);
  if (denied) return denied;

  const def = KINDS[kind];
  if (!def) return { status: 404, data: { error: "Unknown library item type." } };

  const existing = await db.get("SELECT * FROM " + def.table + " WHERE " + def.idColumn + " = ?", [itemId]);
  if (!existing) return { status: 404, data: { error: itemId + " not found." } };

  await db.run("UPDATE " + def.table + " SET archived = 1, last_checked = ? WHERE " + def.idColumn + " = ?", [today(), itemId]);

  const row = await db.get("SELECT * FROM " + def.table + " WHERE " + def.idColumn + " = ?", [itemId]);
  return { status: 200, data: { [def.singular]: row } };
}

async async function getPrices(query) {
  return listKind("prices", query);
}

async async function getOffers(query) {
  return listKind("offers", query);
}

async async function getClaims(query) {
  return listKind("claims", query);
}

async async function getTerms(query) {
  return listKind("terms", query);
}

async async function getRules() {
  const rules = await db.query("SELECT * FROM rules ORDER BY rule_id ASC");
  return { status: 200, data: { rules } };
}

async async function getProtectedNames() {
  const protectedNames = await db.query("SELECT * FROM protected_names");
  return { status: 200, data: { protected_names: protectedNames } };
}

async async function getRegionalNotes() {
  const regionalNotes = await db.query("SELECT * FROM regional_notes");
  return { status: 200, data: { regional_notes: regionalNotes } };
}

// ---------------------------------------------------------------
// UNIFIED LIBRARY & PATCH (GET /api/library & PATCH /api/library/:id)
// ---------------------------------------------------------------
async async function getUnifiedLibrary() {
  const sources = checkStaleSources().map((s) => ({
    ...s,
    id: s.source_id,
    kind: "source",
    last_checked_at: s.last_verified_date
  }));

  const facts = ((await db.query("SELECT * FROM facts WHERE status = 'active' ORDER BY product_code ASC, fact_id ASC"))).map((f) => ({
    ...f,
    id: f.fact_id,
    kind: "fact",
    last_checked_at: f.verified_date
  }));

  const rules = (await db.query("SELECT * FROM rules ORDER BY rule_id ASC")).map((r) => {
    const src = r.source_id
      ? await db.get("SELECT owner, last_verified_date FROM sources WHERE source_id = ?", [r.source_id])
      : null;
    return {
      ...r,
      id: r.rule_id,
      kind: "rule",
      owner: src ? src.owner : "Brand Team",
      last_checked_at: src ? src.last_verified_date : null
    };
  });

  const prices = ((await db.query("SELECT * FROM prices WHERE archived = 0 ORDER BY current_price_inr DESC"))).map((p) => ({
    ...p,
    id: p.price_id,
    kind: "price",
    last_checked_at: p.last_checked || p.effective_date
  }));

  const offers = ((await db.query("SELECT * FROM offers WHERE archived = 0 ORDER BY status ASC, offer_id ASC"))).map((o) => ({
    ...o,
    id: o.offer_id,
    kind: "offer",
    last_checked_at: o.last_checked || o.valid_from
  }));

  const claims = ((await db.query("SELECT * FROM claims WHERE archived = 0 ORDER BY status ASC, claim_id ASC"))).map((c) => ({
    ...c,
    id: c.claim_id,
    kind: "claim",
    last_checked_at: c.last_checked || null
  }));

  const terms = ((await db.query("SELECT * FROM terms WHERE archived = 0 ORDER BY category ASC, term_id ASC"))).map((t) => ({
    ...t,
    id: t.term_id,
    kind: "term",
    last_checked_at: t.last_checked || null
  }));

  return {
    status: 200,
    data: {
      sources,
      facts,
      rules,
      prices,
      offers,
      claims,
      terms,
      items: [...sources, ...facts, ...rules, ...prices, ...offers, ...claims, ...terms]
    }
  };
}

async async function patchLibraryItem(rawId, body, user) {
  const denied = requireEditor(user);
  if (denied) return denied;

  const id = decodeURIComponent(String(rawId || "")).trim();
  if (!id) {
    return { status: 400, data: { error: "Library item id is required." } };
  }

  const input = body || {};
  const hasDate = input.last_checked_at !== undefined;
  if (hasDate && (typeof input.last_checked_at !== "string" || !DATE_RE.test(input.last_checked_at))) {
    return { status: 400, data: { error: "last_checked_at must be a date like 2026-11-14." } };
  }
  const checkedDate = hasDate ? input.last_checked_at : today();

  // 1. Source (e.g. S-06)
  const source = await db.get("SELECT * FROM sources WHERE source_id = ?", [id]);
  if (source) {
    const nextOwner = cleanText(input.owner, 80) || source.owner;
    await db.run(
      "UPDATE sources SET last_verified_date = ?, status = 'current', owner = ? WHERE source_id = ?",
      [checkedDate, nextOwner, id]
    );
    const updated = await db.get("SELECT * FROM sources WHERE source_id = ?", [id]);
    return {
      status: 200,
      data: { item: { ...updated, id: updated.source_id, last_checked_at: updated.last_verified_date } }
    };
  }

  // 2. Fact (e.g. F-01)
  const fact = await db.get("SELECT * FROM facts WHERE fact_id = ?", [id]);
  if (fact) {
    const nextValue = cleanText(input.fact_value, 300) || fact.fact_value;
    const nextOwner = cleanText(input.owner, 80) || fact.owner;
    await db.run(
      "UPDATE facts SET verified_date = ?, fact_value = ?, owner = ? WHERE fact_id = ?",
      [checkedDate, nextValue, nextOwner, id]
    );
    const updated = await db.get("SELECT * FROM facts WHERE fact_id = ?", [id]);
    return {
      status: 200,
      data: { item: { ...updated, id: updated.fact_id, last_checked_at: updated.verified_date } }
    };
  }

  // 3. Rule (e.g. "Tone 1.3") -> used by Guideline Health Score "Save clearer wording"
  const rule = await db.get("SELECT * FROM rules WHERE rule_id = ?", [id]);
  if (rule) {
    const nextText = cleanText(input.text ?? input.wording ?? input.currentWording, 1000) || rule.text;
    const nextTitle = cleanText(input.title, 120) || rule.title;
    await db.run("UPDATE rules SET text = ?, title = ? WHERE rule_id = ?", [nextText, nextTitle, id]);
    const updated = await db.get("SELECT * FROM rules WHERE rule_id = ?", [id]);
    return {
      status: 200,
      data: { item: { ...updated, id: updated.rule_id } }
    };
  }

  // 4. Prices / Offers / Claims / Terms
  for (const kind of Object.keys(KINDS)) {
    const def = KINDS[kind];
    const row = await db.get("SELECT * FROM " + def.table + " WHERE " + def.idColumn + " = ?", [id]);
    if (row) {
      const nextOwner = cleanText(input.owner, 80) || row.owner;
      await db.run(
        "UPDATE " + def.table + " SET last_checked = ?, owner = ? WHERE " + def.idColumn + " = ?",
        [checkedDate, nextOwner || null, id]
      );
      const updated = await db.get("SELECT * FROM " + def.table + " WHERE " + def.idColumn + " = ?", [id]);
      return {
        status: 200,
        data: { item: { ...updated, id: updated[def.idColumn], last_checked_at: updated.last_checked } }
      };
    }
  }

  return { status: 404, data: { error: "Library item " + id + " not found." } };
}

module.exports = {
  getUnifiedLibrary,
  patchLibraryItem,
  getSources,
  getFacts,
  createFact,
  updateFact,
  archiveFact,
  getPrices,
  getOffers,
  getClaims,
  getTerms,
  createItem,
  updateItem,
  archiveItem,
  getRules,
  getProtectedNames,
  getRegionalNotes
};