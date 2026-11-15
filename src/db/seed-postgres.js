// Idempotent PostgreSQL seed: inserts only missing reference rows and never overwrites edits.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");
const db = require("./database");

function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const parseLine = (line) => {
    const values = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        values.push(current.trim());
        current = "";
      } else current += ch;
    }
    values.push(current.trim());
    return values;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).filter(line => line.trim()).map(line => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ""]));
  });
}

function parseRules(content) {
  const rules = [];
  let section = "General";
  let current = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("## Section")) section = line.replace(/^##\s*/, "").trim();
    else if (line.startsWith("### Rule:")) {
      if (current) rules.push(current);
      const parts = line.replace("### Rule:", "").split("-");
      current = {
        rule_id: parts[0].trim(),
        section,
        title: parts.slice(1).join("-").trim(),
        text: "",
        source_id: "S-01"
      };
    } else if (current) current.text += line + "\n";
  }
  if (current) rules.push(current);
  return rules;
}

async function insertMissing(table, columns, row) {
  const values = columns.map(column => row[column] === "" ? null : row[column]);
  const placeholders = columns.map((_, i) => "$" + (i + 1)).join(", ");
  await db.run(
    "INSERT INTO " + table + " (" + columns.join(", ") + ") VALUES (" + placeholders + ") ON CONFLICT DO NOTHING",
    values
  );
}

async function seedPostgresDatabase() {
  if (!db.isPostgres) throw new Error("PostgreSQL DATABASE_URL is required for this seed.");
  // Keep demo-login credentials compatible with the existing SQLite seed.
  // ON CONFLICT DO NOTHING ensures existing user records are never overwritten.
  for (const user of config.DEMO_USERS) {
    const passwordHash = crypto.pbkdf2Sync(
      user.password, "truevoice-salt-2026", 1000, 32, "sha256"
    ).toString("hex");
    await insertMissing("users",
      ["id", "name", "email", "password_hash", "role", "created_at"],
      { ...user, password_hash: passwordHash, created_at: new Date().toISOString() }
    );
  }
  const dir = path.join(__dirname, "..", "data");
  const csv = (name) => parseCSV(fs.readFileSync(path.join(dir, name), "utf8"));

  for (const row of csv("source_registry.csv")) {
    row.validity_days = Number(row.validity_days || 180);
    await insertMissing("sources", ["source_id","title","category","owner","last_verified_date","validity_days","status"], row);
  }
  for (const row of csv("approved_facts.csv")) {
    row.status = "active";
    await insertMissing("facts", ["fact_id","product_code","fact_key","fact_value","source_id","verified_date","status"], row);
  }
  for (const row of csv("pricing.csv")) {
    row.current_price_inr = Number(row.current_price_inr);
    row.old_price_inr = row.old_price_inr ? Number(row.old_price_inr) : null;
    await insertMissing("prices", ["price_id","product_code","product_name","current_price_inr","old_price_inr","effective_date","source_id"], row);
  }
  for (const row of csv("offers.csv")) {
    row.discount_pct = Number(row.discount_pct);
    row.max_discount_inr = row.max_discount_inr ? Number(row.max_discount_inr) : null;
    await insertMissing("offers", ["offer_id","code","title","discount_pct","applies_to","valid_from","valid_to","max_discount_inr","status"], row);
  }
  for (const row of csv("approved_claims.csv")) {
    await insertMissing("claims", ["claim_id","claim_text","status","applies_to","required_evidence","source_id","rule_ref","safe_alternative"], row);
  }
  for (const row of csv("terminology.csv")) {
    await insertMissing("terms", ["term_id","term","category","replacement","reason","rule_ref"], row);
  }
  for (const row of csv("scheduled_posts.csv")) {
    row.price_mentioned_inr = row.price_mentioned_inr ? Number(row.price_mentioned_inr) : null;
    row.launch_date_mentioned = row.launch_date_mentioned || null;
    row.offer_mentioned = row.offer_mentioned || null;
    await insertMissing("scheduled_posts", ["post_id","channel","scheduled_for","product","summary","launch_date_mentioned","price_mentioned_inr","offer_mentioned","status"], row);
  }
  for (const row of csv("protected_names.csv")) {
    await insertMissing("protected_names", ["id","name","category","owner","lookalike_keywords","risk_note"], row);
  }
  for (const row of csv("regional_notes.csv")) {
    row.allowed = row.allowed.toLowerCase() === "true";
    await insertMissing("regional_notes", ["id","phrase","meaning","context","allowed","suggested_action","notes"], row);
  }
  const rules = parseRules(fs.readFileSync(path.join(dir, "brand_guide.md"), "utf8"));
  for (const row of rules) {
    row.text = row.text.trim();
    await insertMissing("rules", ["rule_id","section","title","text","source_id"], row);
  }
  console.log("TrueVoice PostgreSQL reference data seeded (existing rows preserved).");
}

if (require.main === module) {
  seedPostgresDatabase().catch((error) => {
    console.error("PostgreSQL seed failed:", error);
    process.exitCode = 1;
  });
}

module.exports = { seedPostgresDatabase };
