// Database Seeder for TrueVoice
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./database");
const config = require("../config");

function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  
  function parseLine(line) {
    const values = [];
    let current = "";
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }
  
  const headers = parseLine(lines[0]);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;
    const values = parseLine(rawLine);
    const row = {};
    headers.forEach((h, index) => {
      row[h] = values[index] !== undefined ? values[index] : "";
    });
    rows.push(row);
  }
  return rows;
}

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, "truevoice-salt-2026", 1000, 32, "sha256").toString("hex");
}

function parseRulesFromBrandGuide(content) {
  const rules = [];
  const lines = content.split(/\r?\n/);
  let currentRule = null;
  let currentSection = "General";
  
  for (const line of lines) {
    if (line.startsWith("## Section")) {
      currentSection = line.replace(/##\s*/, "").trim();
    } else if (line.startsWith("### Rule:")) {
      if (currentRule) rules.push(currentRule);
      const parts = line.replace("### Rule:", "").split("-");
      const rule_id = parts[0].trim();
      const title = parts.slice(1).join("-").trim();
      currentRule = {
        rule_id,
        section: currentSection,
        title,
        text: "",
        source_id: "S-01"
      };
    } else if (currentRule) {
      currentRule.text += line + "\n";
    }
  }
  if (currentRule) rules.push(currentRule);
  return rules;
}

function seedDatabase() {
  console.log("Seeding TrueVoice database...");
  const dataDir = path.join(__dirname, "..", "data");
  
  // 1. Seed Users
  for (const u of config.DEMO_USERS) {
    const passHash = hashPassword(u.password);
    db.run(
      "INSERT OR REPLACE INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [u.id, u.name, u.email, passHash, u.role, new Date().toISOString()]
    );
  }
  console.log("Seeded " + config.DEMO_USERS.length + " demo users.");

  // 2. Seed Sources
  const sourcesCsv = fs.readFileSync(path.join(dataDir, "source_registry.csv"), "utf-8");
  const sources = parseCSV(sourcesCsv);
  for (const s of sources) {
    db.run(
      "INSERT OR REPLACE INTO sources (source_id, title, category, owner, last_verified_date, validity_days, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [s.source_id, s.title, s.category, s.owner, s.last_verified_date, parseInt(s.validity_days || "180", 10), s.status]
    );
  }
  console.log("Seeded " + sources.length + " sources.");

  // 3. Seed Facts
  const factsCsv = fs.readFileSync(path.join(dataDir, "approved_facts.csv"), "utf-8");
  const facts = parseCSV(factsCsv);
  for (const f of facts) {
    db.run(
      "INSERT OR REPLACE INTO facts (fact_id, product_code, fact_key, fact_value, source_id, verified_date) VALUES (?, ?, ?, ?, ?, ?)",
      [f.fact_id, f.product_code, f.fact_key, f.fact_value, f.source_id, f.verified_date]
    );
  }
  console.log("Seeded " + facts.length + " facts.");

  // 4. Seed Prices
  const pricingCsv = fs.readFileSync(path.join(dataDir, "pricing.csv"), "utf-8");
  const prices = parseCSV(pricingCsv);
  for (const p of prices) {
    db.run(
      "INSERT OR REPLACE INTO prices (price_id, product_code, product_name, current_price_inr, old_price_inr, effective_date, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [p.price_id, p.product_code, p.product_name, parseInt(p.current_price_inr, 10), p.old_price_inr ? parseInt(p.old_price_inr, 10) : null, p.effective_date, p.source_id]
    );
  }
  console.log("Seeded " + prices.length + " prices.");

  // 5. Seed Offers
  const offersCsv = fs.readFileSync(path.join(dataDir, "offers.csv"), "utf-8");
  const offers = parseCSV(offersCsv);
  for (const o of offers) {
    db.run(
      "INSERT OR REPLACE INTO offers (offer_id, code, title, discount_pct, applies_to, valid_from, valid_to, max_discount_inr, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [o.offer_id, o.code, o.title, parseInt(o.discount_pct, 10), o.applies_to, o.valid_from, o.valid_to, o.max_discount_inr ? parseInt(o.max_discount_inr, 10) : null, o.status]
    );
  }
  console.log("Seeded " + offers.length + " offers.");

  // 6. Seed Claims
  const claimsCsv = fs.readFileSync(path.join(dataDir, "approved_claims.csv"), "utf-8");
  const claims = parseCSV(claimsCsv);
  for (const c of claims) {
    db.run(
      "INSERT OR REPLACE INTO claims (claim_id, claim_text, status, applies_to, required_evidence, source_id, rule_ref, safe_alternative) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [c.claim_id, c.claim_text, c.status, c.applies_to, c.required_evidence, c.source_id, c.rule_ref, c.safe_alternative]
    );
  }
  console.log("Seeded " + claims.length + " claims.");

  // 7. Seed Terminology
  const termsCsv = fs.readFileSync(path.join(dataDir, "terminology.csv"), "utf-8");
  const terms = parseCSV(termsCsv);
  for (const t of terms) {
    db.run(
      "INSERT OR REPLACE INTO terms (term_id, term, category, replacement, reason, rule_ref) VALUES (?, ?, ?, ?, ?, ?)",
      [t.term_id, t.term, t.category, t.replacement, t.reason, t.rule_ref]
    );
  }
  console.log("Seeded " + terms.length + " terms.");

  // 8. Seed Scheduled Posts
  const postsCsv = fs.readFileSync(path.join(dataDir, "scheduled_posts.csv"), "utf-8");
  const posts = parseCSV(postsCsv);
  for (const p of posts) {
    db.run(
      "INSERT OR REPLACE INTO scheduled_posts (post_id, channel, scheduled_for, product, summary, launch_date_mentioned, price_mentioned_inr, offer_mentioned, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [p.post_id, p.channel, p.scheduled_for, p.product, p.summary, p.launch_date_mentioned || null, p.price_mentioned_inr ? parseInt(p.price_mentioned_inr, 10) : null, p.offer_mentioned || null, p.status]
    );
  }
  console.log("Seeded " + posts.length + " scheduled posts.");

  // 9. Seed Protected Names
  const protectedCsv = fs.readFileSync(path.join(dataDir, "protected_names.csv"), "utf-8");
  const protectedNames = parseCSV(protectedCsv);
  for (const pn of protectedNames) {
    db.run(
      "INSERT OR REPLACE INTO protected_names (id, name, category, owner, lookalike_keywords, risk_note) VALUES (?, ?, ?, ?, ?, ?)",
      [pn.id, pn.name, pn.category, pn.owner, pn.lookalike_keywords, pn.risk_note]
    );
  }
  console.log("Seeded " + protectedNames.length + " protected names.");

  // 10. Seed Regional Notes
  const regionalCsv = fs.readFileSync(path.join(dataDir, "regional_notes.csv"), "utf-8");
  const regionalNotes = parseCSV(regionalCsv);
  for (const rn of regionalNotes) {
    db.run(
      "INSERT OR REPLACE INTO regional_notes (id, phrase, meaning, context, allowed, suggested_action, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [rn.id, rn.phrase, rn.meaning, rn.context, rn.allowed === "true" ? 1 : 0, rn.suggested_action, rn.notes]
    );
  }
  console.log("Seeded " + regionalNotes.length + " regional notes.");

  // 11. Seed Brand Rules
  const brandGuideMd = fs.readFileSync(path.join(dataDir, "brand_guide.md"), "utf-8");
  const rules = parseRulesFromBrandGuide(brandGuideMd);
  for (const r of rules) {
    db.run(
      "INSERT OR REPLACE INTO rules (rule_id, section, title, text, source_id) VALUES (?, ?, ?, ?, ?)",
      [r.rule_id, r.section, r.title, r.text.trim(), r.source_id]
    );
  }
  console.log("Seeded " + rules.length + " brand rules from guide.");

  
  // 12. Seed Demo Queue Drafts (From Page 6 Judges Sketches)
  const demoQueue = [
    {
      id: "drf_demo_01",
      title: "Email_Launch.docx",
      content: "Our serum is clinically proven to remove wrinkles in 3 days. Launching Friday 20 Nov with flat 30% off!",
      channel: "Email",
      product_code: "GV-SER-30",
      risk_level: "HIGH",
      status: "submitted",
      findings: [
        {
          id: "fnd_d01_1",
          type: "prohibited_claim",
          severity: "HIGH",
          flagged_text: "clinically proven",
          rule_ref: "Claims 3.1",
          source_id: "S-01",
          reason: "Rule: health or beauty claims need an approved study. None found, so it is marked Unverified, needs source.",
          suggested_fix: "Formulated with hyaluronic acid to help skin look smoother (an approved fact)"
        },
        {
          id: "fnd_d01_2",
          type: "offer_violation",
          severity: "HIGH",
          flagged_text: "flat 30% off",
          rule_ref: "Offers 2.2",
          source_id: "S-08",
          reason: "The approved offer sheet says 20% off, valid 20-30 Nov 2026.",
          suggested_fix: "Flat 20% off"
        },
        {
          id: "fnd_d01_3",
          type: "schedule_clash",
          severity: "MEDIUM",
          flagged_text: "Friday 20 Nov",
          rule_ref: "Schedule 5.1",
          source_id: "S-01",
          reason: "Clash: an Instagram post scheduled for Thu 19 Nov announces the same launch.",
          suggested_fix: "Match the date across channels, or ask the campaign owner."
        }
      ]
    },
    {
      id: "drf_demo_02",
      title: "Banner_Diwali.png",
      content: "Celebrate this festive season with radiant skin. Use WELCOME10 for 10% off your first order.",
      channel: "Display Ads",
      product_code: "ALL",
      risk_level: "LOW",
      status: "in_review",
      findings: []
    },
    {
      id: "drf_demo_03",
      title: "Deck_Q4_Sales.pptx",
      content: "Introducing Dewlite alternative serum with cruelty-free certified testing for our Q4 sales partners.",
      channel: "Sales",
      product_code: "GV-SER-30",
      risk_level: "MEDIUM",
      status: "submitted",
      findings: [
        {
          id: "fnd_d03_1",
          type: "trademark_warning",
          severity: "MEDIUM",
          flagged_text: "Dewlite",
          rule_ref: "Naming 4.1",
          source_id: "S-09",
          reason: "Heads up: this sounds similar to Dewlite (Lumina Cosmetics). This is an AI suggestion, not legal advice. Please consult your legal team.",
          suggested_fix: "Verify non-infringement with Legal Team"
        },
        {
          id: "fnd_d03_2",
          type: "restricted_claim",
          severity: "MEDIUM",
          flagged_text: "cruelty-free certified",
          rule_ref: "Claims 3.3",
          source_id: "S-06",
          reason: "Underlying source (S-06) expired on 2025-10-01 and certificate review is overdue.",
          suggested_fix: "Hold claim until Quality Team uploads renewed certificate"
        }
      ]
    },
    {
      id: "drf_demo_04",
      title: "Post_Teaser.txt",
      content: "Something fresh is arriving. Hydra Glow Serum with 2% hyaluronic acid for deep hydration.",
      channel: "Instagram",
      product_code: "GV-SER-30",
      risk_level: "LOW",
      status: "in_review",
      findings: []
    }
  ];

  const now = new Date().toISOString();
  for (const dq of demoQueue) {
    db.run(
      "INSERT OR REPLACE INTO drafts (id, title, content, original_content, channel, product_code, creator_id, status, risk_level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [dq.id, dq.title, dq.content, dq.content, dq.channel, dq.product_code, "usr_creator_01", dq.status, dq.risk_level, now, now]
    );
    for (const df of dq.findings) {
      db.run(
        "INSERT OR REPLACE INTO findings (id, draft_id, type, severity, flagged_text, rule_ref, source_id, reason, suggested_fix, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0, 'pending', ?)",
        [df.id, dq.id, df.type, df.severity, df.flagged_text, df.rule_ref, df.source_id, df.reason, df.suggested_fix, now]
      );
    }
  }
  console.log("Seeded " + demoQueue.length + " demo drafts matching Page 6 Sketches.");

  console.log("Database seeded successfully!");
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, hashPassword };
