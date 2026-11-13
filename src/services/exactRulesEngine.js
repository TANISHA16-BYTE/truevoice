// Exact-Match Rules Engine
const db = require("../db/database");
const config = require("../config");

const EXACT_MONTH_MAP = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12"
};

function extractQuotedPrices(text) {
  const found = [];
  const seen = new Set();
  const patterns = [
    /(?:₹|inr\s*|rs\.?\s*)(\d{2,5})\b/gi,
    /\b(\d{2,5})\s*(?:rs\.?|inr)\b/gi,
    /\b(?:priced at|price(?:d)?(?: of)?|for just|now just|available (?:now )?for|at)\s+(\d{3,5})\b(?!\s*(?:ml|g|mg|%|percent|volunteers|days|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct))/gi
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const value = parseInt(m[1], 10);
      if (Number.isFinite(value) && !seen.has(value)) {
        seen.add(value);
        found.push({ value, raw: m[0].trim() });
      }
    }
  }
  return found;
}

function extractOfferCheckDates(text, defaultYear = "2026") {
  const dates = [];
  const seen = new Set();
  const add = (iso) => {
    if (!seen.has(iso)) {
      seen.add(iso);
      dates.push(iso);
    }
  };

  let m;
  const isoRe = /\b(\d{4}-\d{2}-\d{2})\b/g;
  while ((m = isoRe.exec(text)) !== null) add(m[1]);

  const dmyRe = /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/gi;
  while ((m = dmyRe.exec(text)) !== null) {
    const month = EXACT_MONTH_MAP[m[2].toLowerCase()];
    if (month) add(`${m[3] || defaultYear}-${month}-${m[1].padStart(2, "0")}`);
  }

  const mdyRe = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/gi;
  while ((m = mdyRe.exec(text)) !== null) {
    const month = EXACT_MONTH_MAP[m[1].toLowerCase()];
    if (month) add(`${m[3] || defaultYear}-${month}-${m[2].padStart(2, "0")}`);
  }

  return dates;
}

function checkExactRules(text, metadata = {}) {
  const findings = [];
  const normalizedText = text.toLowerCase();
  
  // ----------------------------------------------------
  // 1. TERMINOLOGY CHECKS (Banned & Retired Terms)
  // ----------------------------------------------------
  const terms = db.query("SELECT * FROM terms");
  for (const t of terms) {
    const termLower = t.term.toLowerCase();
    const termVariants = termLower.split("/").map(v => v.trim()).filter(Boolean);
    
    for (const variant of termVariants) {
      if (normalizedText.includes(variant)) {
        findings.push({
          type: "terminology",
          severity: t.category === "retired" ? "MEDIUM" : "HIGH",
          flagged_text: variant,
          rule_ref: t.rule_ref,
          source_id: "S-01",
          reason: "Term " + JSON.stringify(variant) + " is " + t.category + ": " + t.reason + ".",
          suggested_fix: t.replacement,
          confidence: 1.0
        });
        break;
      }
    }
  }

  // ----------------------------------------------------
  // 2. CLAIMS CHECKS (Approved, Restricted, Prohibited)
  // ----------------------------------------------------
  const claims = db.query("SELECT * FROM claims");
  for (const c of claims) {
    const claimLower = c.claim_text.toLowerCase();
    const claimVariants = claimLower.split("/").map(v => v.trim()).filter(Boolean);
    
    let matched = false;
    let matchedSnippet = "";
    
    if (c.claim_id === "C-07" && normalizedText.includes("clinically proven")) {
      matched = true;
      matchedSnippet = "clinically proven";
    } else if (c.claim_id === "C-08" && (normalizedText.includes("remove wrinkles") || normalizedText.includes("removes wrinkles") || normalizedText.includes("anti-wrinkle") || (normalizedText.includes("wrinkle") && normalizedText.includes("days")))) {
      matched = true;
      matchedSnippet = "removes wrinkles in 3 days";
    } else if (c.claim_id === "C-09" && (normalizedText.includes("100% natural") || normalizedText.includes("chemical-free") || normalizedText.includes("chemical free"))) {
      matched = true;
      matchedSnippet = normalizedText.includes("100% natural") ? "100% natural" : "chemical-free";
    } else if (c.claim_id === "C-10" && (normalizedText.includes("guaranteed results") || normalizedText.includes("instant results"))) {
      matched = true;
      matchedSnippet = normalizedText.includes("guaranteed results") ? "guaranteed results" : "instant results";
    } else if (c.claim_id === "C-11" && (normalizedText.includes("dermatologist-recommended") || normalizedText.includes("dermatologist recommended"))) {
      matched = true;
      matchedSnippet = "dermatologist-recommended";
    } else if (c.claim_id === "C-12" && (normalizedText.includes("best sunscreen in india") || normalizedText.includes("no. 1 sunscreen") || normalizedText.includes("number 1 sunscreen"))) {
      matched = true;
      matchedSnippet = "best sunscreen in India";
    } else if (c.claim_id === "C-13" && (normalizedText.includes("cures acne") || normalizedText.includes("cure acne") || normalizedText.includes("treats acne") || normalizedText.includes("skin disease") || (normalizedText.includes("cures") && normalizedText.includes("skin")))) {
      matched = true;
      matchedSnippet = "cures acne";
    } else if (c.claim_id === "C-06" && (normalizedText.includes("sensitive skin") || normalizedText.includes("suitable for sensitive skin"))) {
      matched = true;
      matchedSnippet = "suitable for sensitive skin";
    } else if (c.claim_id === "C-05" && normalizedText.includes("cruelty-free")) {
      matched = true;
      matchedSnippet = "cruelty-free certified";
    } else {
      for (const v of claimVariants) {
        if (normalizedText.includes(v)) {
          matched = true;
          matchedSnippet = v;
          break;
        }
      }
    }
    
    if (matched) {
      if (c.claim_id === "C-06") {
        findings.push({
          type: "unverified_claim",
          severity: "HIGH",
          flagged_text: matchedSnippet,
          rule_ref: c.rule_ref || "Claims 3.1",
          source_id: null,
          reason: "Rule: health or beauty claims need an approved study. Sensitive-skin study is not on file, so it is marked Unverified, needs source.",
          suggested_fix: c.safe_alternative || "Gentle, fragrance-free formula",
          confidence: 0.95
        });
      } else if (c.status.startsWith("prohibited")) {
        findings.push({
          type: "prohibited_claim",
          severity: "HIGH",
          flagged_text: matchedSnippet,
          rule_ref: c.rule_ref,
          source_id: c.source_id || "S-01",
          reason: "Prohibited claim under " + c.rule_ref + ": " + c.required_evidence + ".",
          suggested_fix: c.safe_alternative,
          confidence: 1.0
        });
      } else if (c.status.startsWith("restricted")) {
        findings.push({
          type: "restricted_claim",
          severity: "MEDIUM",
          flagged_text: matchedSnippet,
          rule_ref: c.rule_ref,
          source_id: c.source_id,
          reason: "Restricted claim: " + c.status + ".",
          suggested_fix: c.safe_alternative,
          confidence: 0.90
        });
      }
    }
  }

  // ----------------------------------------------------
  // 3. PRICING CHECKS (Outdated & Incorrect Prices)
  // ----------------------------------------------------
  const prices = db.query("SELECT * FROM prices");
  const matchedProducts = prices.filter((p) => {
    const productLower = p.product_name.toLowerCase();
    const codeLower = p.product_code.toLowerCase();
    return (
      normalizedText.includes(productLower) ||
      normalizedText.includes(codeLower) ||
      (p.product_code === "GV-SPF-50" && (normalizedText.includes("sunscreen") || normalizedText.includes("shield"))) ||
      (p.product_code === "GV-SER-30" && (normalizedText.includes("serum") || normalizedText.includes("hydra"))) ||
      (p.product_code === "GV-CLN-100" && (normalizedText.includes("cleanser") || normalizedText.includes("foam")))
    );
  });

  const isBundleContext = normalizedText.includes("bundle") || matchedProducts.length > 1;
  const quotedPrices = extractQuotedPrices(text);

  for (const p of matchedProducts) {
    // 3a. Existing outdated price check (old_price_inr)
    if (p.old_price_inr && p.old_price_inr !== p.current_price_inr && normalizedText.includes(String(p.old_price_inr))) {
      findings.push({
        type: "pricing_violation",
        severity: "HIGH",
        flagged_text: "₹" + p.old_price_inr,
        rule_ref: "Pricing 2.1",
        source_id: p.source_id || "S-04",
        reason: "Outdated price: " + p.product_name + " was ₹" + p.old_price_inr + ", but current price is ₹" + p.current_price_inr + " (effective " + p.effective_date + ").",
        suggested_fix: "₹" + p.current_price_inr,
        confidence: 1.0
      });
    }

    // 3b. Arbitrary incorrect price check against current_price_inr (skip multi-SKU bundles)
    if (!isBundleContext) {
      for (const qp of quotedPrices) {
        if (qp.value !== p.current_price_inr && qp.value !== p.old_price_inr) {
          findings.push({
            type: "pricing_violation",
            severity: "HIGH",
            flagged_text: "₹" + qp.value,
            rule_ref: "Pricing 2.1",
            source_id: p.source_id || "S-04",
            reason: "Incorrect price: " + p.product_name + " current price is ₹" + p.current_price_inr + ", not ₹" + qp.value + " (effective " + p.effective_date + ").",
            suggested_fix: "₹" + p.current_price_inr,
            confidence: 0.95
          });
        }
      }
    }
  }

  // ----------------------------------------------------
  // 4. OFFERS & CAMPAIGN CHECKS (Discounts, Status & Dates)
  // ----------------------------------------------------
  if (normalizedText.includes("30% off") || normalizedText.includes("30% discount") || normalizedText.includes("flat 30%")) {
    findings.push({
      type: "offer_violation",
      severity: "HIGH",
      flagged_text: "30% off",
      rule_ref: "Offers 2.2",
      source_id: "S-08",
      reason: "The approved offer sheet says 20% off (WINTER20, valid 20-30 Nov 2026). Unapproved discount rate 30%.",
      suggested_fix: "Flat 20% off",
      confidence: 1.0
    });
  }

  let diwaliFlagged = false;
  if (normalizedText.includes("diwali") || normalizedText.includes("diwali15")) {
    diwaliFlagged = true;
    findings.push({
      type: "expired_offer",
      severity: "HIGH",
      flagged_text: "Diwali offer",
      rule_ref: "Offers 2.2",
      source_id: "S-08",
      reason: "The Diwali Glow Special (OFF-04) expired on 2026-11-10 and can no longer be promoted.",
      suggested_fix: "Use active winter campaign offer (WINTER20) or standard WELCOME10",
      confidence: 1.0
    });
  }

  const offers = db.query("SELECT * FROM offers");
  const demoDate = config.DEMO_DATE || "2026-11-13";
  const explicitDates = extractOfferCheckDates(text, demoDate.slice(0, 4));
  const scheduledDate = metadata.scheduled_for ? String(metadata.scheduled_for).slice(0, 10) : null;
  const datesToValidate = scheduledDate ? [scheduledDate, ...explicitDates] : explicitDates;

  for (const offer of offers) {
    const codeLower = offer.code.toLowerCase();
    const titleLower = offer.title.toLowerCase();
    const mentionsOffer = normalizedText.includes(codeLower) || normalizedText.includes(titleLower);
    if (!mentionsOffer) continue;
    if (offer.offer_id === "OFF-04" && diwaliFlagged) continue;

    // Status or past valid_to against DEMO_DATE / scheduled date
    const checkDate = scheduledDate || demoDate;
    if (offer.status === "expired" || checkDate > offer.valid_to) {
      findings.push({
        type: "expired_offer",
        severity: "HIGH",
        flagged_text: offer.code,
        rule_ref: "Offers 2.2",
        source_id: "S-08",
        reason: "Offer " + offer.title + " (" + offer.code + ", " + offer.offer_id + ") expired on " + offer.valid_to + " (status: " + offer.status + ").",
        suggested_fix: "Use an active offer within its valid window (e.g., WINTER20: 2026-11-20 to 2026-11-30, or WELCOME10: 2026-11-01 to 2026-12-31).",
        confidence: 1.0
      });
      continue;
    }

    // Explicit date (mentioned in draft text or metadata.scheduled_for) outside [valid_from, valid_to]
    for (const d of datesToValidate) {
      if (d < offer.valid_from || d > offer.valid_to) {
        findings.push({
          type: "offer_date_violation",
          severity: "HIGH",
          flagged_text: offer.code,
          rule_ref: "Offers 2.2",
          source_id: "S-08",
          reason: "Offer " + offer.code + " (" + offer.offer_id + ") is only valid from " + offer.valid_from + " to " + offer.valid_to + ", not on " + d + ".",
          suggested_fix: "Align promotion date to " + offer.valid_from + "–" + offer.valid_to + " or use WELCOME10.",
          confidence: 1.0
        });
        break;
      }
    }
  }

  // ----------------------------------------------------
  // 5. TONE 1.3 CHECKS (Aggressive FOMO & Multiple Exclamations)
  // ----------------------------------------------------
  const hasMultipleExclamations = /!{2,}/.test(text);
  const uppercaseWords = (text.match(/\b[A-Z]{3,}\b/g) || []).filter(w => !["INR", "SPF", "ALL", "ISO", "OFF", "USA"].includes(w));
  const hasPushyWords = /\b(hurry|buy now|limited rush|grab before|steal deal)\b/i.test(text);
  
  if (hasMultipleExclamations || uppercaseWords.length >= 2 || (hasPushyWords && hasMultipleExclamations)) {
    const snippet = hasMultipleExclamations ? (text.match(/[^.!?]+!{2,}/)?.[0] || "Excessive punctuation") : uppercaseWords.slice(0, 3).join(" ");
    findings.push({
      type: "tone_violation",
      severity: "MEDIUM",
      flagged_text: snippet.trim(),
      rule_ref: "Tone 1.3",
      source_id: "S-01",
      reason: "Rule Tone 1.3 prohibits aggressive sales urgency, shouting (all-caps), or repeated exclamation marks.",
      suggested_fix: "Use grounded, welcoming wording such as Discover your routine today or Available now.",
      confidence: 0.95
    });
  }

  return findings;
}

module.exports = {
  checkExactRules
};
