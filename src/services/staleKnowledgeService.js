// Stale Knowledge & Source Validity Monitor
const db = require("../db/database");
const config = require("../config");

function checkStaleSources() {
  const sources = db.query("SELECT * FROM sources");
  const demoDate = new Date(config.DEMO_DATE);
  
  const results = [];
  for (const s of sources) {
    const verifiedDate = new Date(s.last_verified_date);
    const ageInDays = Math.floor((demoDate - verifiedDate) / (1000 * 60 * 60 * 24));
    const isStale = ageInDays > s.validity_days || s.status === "expired";
    
    results.push({
      source_id: s.source_id,
      title: s.title,
      owner: s.owner,
      category: s.category,
      last_verified_date: s.last_verified_date,
      validity_days: s.validity_days,
      current_age_days: ageInDays,
      status: isStale ? "stale" : "current",
      is_stale: isStale,
      needs_review: isStale
    });
  }
  return results;
}

function getSourceById(sourceId) {
  return db.get("SELECT * FROM sources WHERE source_id = ?", [sourceId]);
}

module.exports = {
  checkStaleSources,
  getSourceById
};
