// Library Controller (Inspection & Management of Approved Knowledge Base)
const db = require("../db/database");
const { checkStaleSources } = require("../services/staleKnowledgeService");

function getSources() {
  const sources = checkStaleSources();
  return { status: 200, data: { sources } };
}

function getFacts() {
  const facts = db.query("SELECT * FROM facts ORDER BY product_code ASC");
  return { status: 200, data: { facts } };
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
  getPrices,
  getOffers,
  getClaims,
  getTerms,
  getRules,
  getProtectedNames,
  getRegionalNotes
};
