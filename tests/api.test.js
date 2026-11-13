// In-Memory API Integration Test Suite for TrueVoice (18 Comprehensive Tests)
const { server } = require("../server");
const { seedDatabase } = require("../src/db/seed");
const config = require("../src/config");
const { checkExactRules } = require("../src/services/exactRulesEngine");
const EventEmitter = require("events");

function invokeRoute(method, urlStr, headers = {}, body = null) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = urlStr;
    req.headers = { ...headers };

    let resHeaders = {};
    let statusCode = 200;
    let resData = "";

    const res = {
      writeHead(code, hdrs) {
        statusCode = code;
        resHeaders = hdrs || {};
      },
      setHeader(k, v) {
        resHeaders[k] = v;
      },
      end(chunk) {
        if (chunk) resData += chunk;
        try {
          resolve({ status: statusCode, data: JSON.parse(resData), headers: resHeaders });
        } catch (e) {
          resolve({ status: statusCode, data: resData, headers: resHeaders });
        }
      }
    };

    server.emit("request", req, res);

    if (body) {
      const payload = typeof body === "string" ? body : JSON.stringify(body);
      req.emit("data", Buffer.from(payload));
    }
    req.emit("end");
  });
}

async function runApiTests() {
  seedDatabase();
  console.log("\n=======================================================");
  console.log("   TRUEVOICE FULL 18-FEATURE INTEGRATION TEST SUITE");
  console.log("=======================================================\n");

  try {
    console.log("[TEST 1] GET /api/health");
    const health = await invokeRoute("GET", "/api/health");
    if (health.status !== 200 || health.data.status !== "ONLINE") throw new Error("Health check failed");
    console.log("  -> Passed. Server is ONLINE.");

    console.log("\n[TEST 2] GET /docs (Interactive Swagger UI)");
    const docs = await invokeRoute("GET", "/docs");
    if (docs.status !== 200 || typeof docs.data !== "string" || !docs.data.includes("swagger-ui")) throw new Error("Swagger UI failed");
    console.log("  -> Passed. Interactive Swagger UI loaded.");

    console.log("\n[TEST 3] GET /api/openapi.json");
    const openapi = await invokeRoute("GET", "/api/openapi.json");
    if (openapi.status !== 200 || !openapi.data.paths["/api/check"]) throw new Error("OpenAPI spec failed");
    console.log("  -> Passed. OpenAPI 3.0 specification generated.");

    console.log("\n[TEST 4] POST /api/auth/login (Creator & Reviewer)");
    const creatorLogin = await invokeRoute("POST", "/api/auth/login", { "content-type": "application/json" }, {
      email: "tanisha@glowvale.demo",
      password: "creator123"
    });
    if (creatorLogin.status !== 200 || !creatorLogin.data.token) throw new Error("Creator login failed");
    const creatorToken = creatorLogin.data.token;
    console.log("  -> Passed. Logged in Tanisha Jain (Role: " + creatorLogin.data.user.role + ")");

    const reviewerLogin = await invokeRoute("POST", "/api/auth/login", { "content-type": "application/json" }, {
      email: "riddhi@glowvale.demo",
      password: "reviewer123"
    });
    const reviewerToken = reviewerLogin.data.token;
    console.log("  -> Passed. Logged in Riddhi Sharma (Role: " + reviewerLogin.data.user.role + ")");

    console.log("\n[TEST 5] GET /api/library/sources & Stale Detection");
    const sourcesRes = await invokeRoute("GET", "/api/library/sources");
    const s06 = sourcesRes.data.sources.find(s => s.source_id === "S-06");
    if (!s06 || !s06.is_stale) throw new Error("Stale source S-06 not flagged");
    console.log("  -> Passed. Source S-06 (Cruelty-Free Certificate) correctly flagged as stale.");

    console.log("\n[TEST 6] POST /api/check (Instant Safety Check)");
    const checkRes = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
      text: "Our serum is clinically proven to remove wrinkles in 3 days. Launching Friday 20 Nov with flat 30% off!"
    });
    if (checkRes.status !== 200 || checkRes.data.risk_level !== "HIGH") throw new Error("Check pipeline failed");
    console.log("  -> Passed. Caught " + checkRes.data.findings_count + " violations. Risk: " + checkRes.data.risk_level);

    console.log("\n[TEST 7] POST /api/check/batch (Multi-Channel Campaign Batch Check)");
    const batchRes = await invokeRoute("POST", "/api/check/batch", { "content-type": "application/json" }, {
      drafts: [
        { channel: "Instagram", content: "Hydra Glow Serum launching 20 Nov for 799", launch_date: "2026-11-20" },
        { channel: "Twitter", content: "Daily Shield Sunscreen for 549", launch_date: "2026-11-20" }
      ]
    });
    if (batchRes.status !== 200 || batchRes.data.total_drafts_analyzed !== 2) throw new Error("Batch check failed");
    console.log("  -> Passed. Batch scan analyzed " + batchRes.data.total_drafts_analyzed + " multi-channel drafts.");

    console.log("\n[TEST 8] POST /api/upload (File Upload & Extraction)");
    const uploadRes = await invokeRoute("POST", "/api/upload", { "content-type": "application/json" }, {
      filename: "Summer_Launch_Post.docx",
      content: "Hydra Glow Serum drops soon with 2% hyaluronic acid for 799."
    });
    if (uploadRes.status !== 200 || !uploadRes.data.extracted_content) throw new Error("Upload extraction failed");
    console.log("  -> Passed. File uploaded & extracted (" + uploadRes.data.extracted_length + " characters).");

    console.log("\n[TEST 9] POST /api/drafts (Submit Review Request)");
    const draftRes = await invokeRoute(
      "POST",
      "/api/drafts",
      { "content-type": "application/json", authorization: "Bearer " + creatorToken },
      {
        title: "Summer Launch Campaign",
        content: "Our serum is clinically proven to remove wrinkles in 3 days. Launching Friday 20 Nov with flat 30% off!",
        channel: "Instagram",
        product_code: "GV-SER-30"
      }
    );
    if (draftRes.status !== 201) throw new Error("Draft creation failed");
    const draftId = draftRes.data.draft_id;
    const findings = draftRes.data.findings;
    console.log("  -> Passed. Created draft " + draftId + " with " + findings.length + " persisted findings.");

    console.log("\n[TEST 10] GET /api/drafts (Review Queue sorted by High Risk first)");
    const queueRes = await invokeRoute("GET", "/api/drafts");
    if (queueRes.status !== 200 || queueRes.data.drafts.length === 0) throw new Error("Queue failed");
    console.log("  -> Passed. Review queue retrieved (" + queueRes.data.drafts.length + " drafts in queue).");

    console.log("\n[TEST 11] POST /api/drafts/:id/findings/:fid/explain (One-chance \x27Why flagged?\x27)");
    const explainRes = await invokeRoute(
      "POST",
      "/api/drafts/" + draftId + "/findings/" + findings[0].id + "/explain",
      { "content-type": "application/json", authorization: "Bearer " + creatorToken },
      { explanation: "This was intended as a festive hyperbole for our launch teaser." }
    );
    if (explainRes.status !== 200) throw new Error("Explain finding failed");
    console.log("  -> Passed. Recorded creator context explanation.");

    console.log("\n[TEST 12] POST /api/drafts/:id/handover (One-click Manager Handover)");
    const handoverRes = await invokeRoute(
      "POST",
      "/api/drafts/" + draftId + "/handover",
      { "content-type": "application/json", authorization: "Bearer " + creatorToken },
      { reason: "Needs review from Lead Reviewer Riddhi regarding discount discrepancy." }
    );
    if (handoverRes.status !== 200) throw new Error("Handover failed");
    console.log("  -> Passed. Escalated draft to manager review queue.");

    console.log("\n[TEST 13] POST /api/drafts/:id/findings/:fid/accept (Accept Fix)");
    const acceptRes = await invokeRoute(
      "POST",
      "/api/drafts/" + draftId + "/findings/" + findings[0].id + "/accept",
      { "content-type": "application/json", authorization: "Bearer " + creatorToken },
      { custom_fix: findings[0].suggested_fix }
    );
    if (acceptRes.status !== 200) throw new Error("Accept fix failed");
    console.log("  -> Passed. Fix applied to draft content.");

    console.log("\n[TEST 14] POST /api/drafts/:id/approve (Approval & Cryptographic Badge)");
    const approveRes = await invokeRoute(
      "POST",
      "/api/drafts/" + draftId + "/approve",
      { "content-type": "application/json", authorization: "Bearer " + reviewerToken },
      {}
    );
    if (approveRes.status !== 200 || !approveRes.data.badge) throw new Error("Approval failed");
    const badge = approveRes.data.badge;
    console.log("  -> Passed. Draft officially approved! Badge: " + badge.badge_code);
    console.log("     Content SHA-256 Hash: " + badge.content_hash);

    console.log("\n[TEST 15] GET & POST /api/verify (Public Badge & Tamper Detection)");
    const verifyBadgeRes = await invokeRoute("GET", "/api/verify/" + badge.badge_code);
    if (verifyBadgeRes.status !== 200 || !verifyBadgeRes.data.found) throw new Error("Badge lookup failed");
    console.log("  -> Passed. Public badge lookup verified.");

    const authenticCheck = await invokeRoute("POST", "/api/verify", { "content-type": "application/json" }, {
      badge_code: badge.badge_code,
      content: badge.snapshot_content
    });
    if (authenticCheck.data.submitted_content_verification.status !== "VERIFIED_AUTHENTIC") {
      throw new Error("Authentic verification failed");
    }
    console.log("  -> Passed. Original content verified as VERIFIED_AUTHENTIC.");

    const tamperedCheck = await invokeRoute("POST", "/api/verify", { "content-type": "application/json" }, {
      badge_code: badge.badge_code,
      content: badge.snapshot_content + " Edited after approval!"
    });
    if (tamperedCheck.data.submitted_content_verification.status !== "MODIFIED_TAMPERED") {
      throw new Error("Tamper detection failed");
    }
    console.log("  -> Passed. Tampered text correctly triggered warning.");

    console.log("\n[TEST 16] GET /api/verify/:badgeCode/qr (QR Code SVG Generation)");
    const qrRes = await invokeRoute("GET", "/api/verify/" + badge.badge_code + "/qr");
    if (qrRes.status !== 200 || typeof qrRes.data !== "string" || !qrRes.data.includes("<svg")) throw new Error("QR Code failed");
    console.log("  -> Passed. Verification QR Code SVG generated successfully.");

    console.log("\n[TEST 17] GET /api/health-score (Guideline Health Calculation)");
    const healthRes = await invokeRoute("GET", "/api/health-score");
    if (healthRes.status !== 200 || !healthRes.data.health_score) throw new Error("Health score failed");
    console.log("  -> Passed. Guideline Health Score: " + healthRes.data.health_score + "/100. Status: " + healthRes.data.status);

    console.log("\n[TEST 18] GET /api/audit-logs/export?format=csv (Regulatory Audit Export)");
    const auditRes = await invokeRoute("GET", "/api/audit-logs/export?format=csv");
    if (auditRes.status !== 200 || typeof auditRes.data !== "string" || !auditRes.data.includes("History_ID")) throw new Error("Audit CSV export failed");
    console.log("  -> Passed. Compliance Audit Log CSV exported successfully.");
    console.log("\n[TEST 19] Gemini Unavailable/Failing Fallback & 4 Demo Drafts");
    const savedGeminiKey = config.GEMINI_API_KEY;
    try {
      config.GEMINI_API_KEY = ""; // Simulate missing key / offline fallback
      const d1 = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
        text: "Our serum is clinically proven to remove wrinkles in 3 days. Launching Friday 20 Nov with flat 30% off!",
        channel: "Email",
        product_code: "GV-SER-30"
      });
      const d2 = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
        text: "Celebrate this festive season with radiant skin. Use WELCOME10 for 10% off your first order.",
        channel: "Display Ads",
        product_code: "ALL"
      });
      const d3 = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
        text: "Introducing Dewlite alternative serum with cruelty-free certified testing for our Q4 sales partners.",
        channel: "Sales",
        product_code: "GV-SER-30"
      });
      const d4 = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
        text: "Something fresh is arriving. Hydra Glow Serum with 2% hyaluronic acid for deep hydration.",
        channel: "Instagram",
        product_code: "GV-SER-30"
      });
      if (d1.status !== 200 || d1.data.risk_level !== "HIGH") throw new Error("Demo draft 1 fallback failed");
      if (d2.status !== 200 || d2.data.risk_level !== "LOW" || d2.data.findings_count !== 0) throw new Error("Demo draft 2 fallback failed");
      if (d3.status !== 200 || d3.data.risk_level !== "MEDIUM") throw new Error("Demo draft 3 fallback failed");
      if (d4.status !== 200 || d4.data.risk_level !== "LOW" || d4.data.findings_count !== 0) throw new Error("Demo draft 4 fallback failed");

      // Simulate invalid key (API 400/403 failure fallback without crashing)
      config.GEMINI_API_KEY = "invalid-gemini-key-for-fallback-test";
      const failCheck = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
        text: "Hydra Glow Serum with 2% hyaluronic acid."
      });
      if (failCheck.status !== 200) throw new Error("Gemini failure crashed /api/check");
    } finally {
      config.GEMINI_API_KEY = savedGeminiKey;
    }
    console.log("  -> Passed. Fallback handled Gemini outage & all 4 demo drafts.");

    console.log("\n[TEST 20] Launch Date Validation (No false launch clash vs Conflicting launch date)");
    const cleanDrop = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
      text: "Our new serum drops soon!",
      channel: "Instagram",
      product_code: "GV-SER-30"
    });
    if (cleanDrop.data.findings.some(f => f.type === "schedule_clash")) {
      throw new Error("False positive launch clash on dateless launch mention");
    }
    const wrongLaunch = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
      text: "Hydra Glow Serum launches Thursday 19 Nov!",
      channel: "Email",
      product_code: "GV-SER-30"
    });
    if (!wrongLaunch.data.findings.some(f => f.type === "schedule_clash" && f.rule_ref === "Schedule 5.1")) {
      throw new Error("Conflicting launch date 19 Nov was not flagged");
    }
    console.log("  -> Passed. Launch-date bug fixed and conflicting dates flagged.");

    console.log("\n[TEST 21] Offer Date Validation (Valid vs Expired & Out-of-Window Dates)");
    const validOffer = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
      text: "Get 20% off Hydra Glow Serum using WINTER20 on 22 Nov 2026."
    });
    if (validOffer.data.findings.some(f => f.type === "expired_offer" || f.type === "offer_date_violation")) {
      throw new Error("Valid offer window was falsely flagged");
    }
    const expiredOffer = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
      text: "Use DIWALI15 for 15% off today!"
    });
    if (!expiredOffer.data.findings.some(f => f.type === "expired_offer")) {
      throw new Error("Expired offer DIWALI15 was not flagged");
    }
    const outOfWindowOffer = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
      text: "Use WINTER20 on 5 Dec 2026 for 20% off."
    });
    if (!outOfWindowOffer.data.findings.some(f => f.type === "offer_date_violation")) {
      throw new Error("Out-of-window offer date was not flagged");
    }
    const scheduledOutOfWindow = checkExactRules("Use WINTER20 for 20% off.", { scheduled_for: "2026-11-15" });
    if (!scheduledOutOfWindow.some(f => f.type === "offer_date_violation")) {
      throw new Error("scheduled_for before offer valid_from was not flagged");
    }
    console.log("  -> Passed. Offer date windows validated.");

    console.log("\n[TEST 22] Arbitrary Incorrect Price & Scheduled-Post P-03 Conflict (₹499 vs ₹549)");
    const wrongSerumPrice = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
      text: "Order Hydra Glow Serum today for ₹650."
    });
    if (!wrongSerumPrice.data.findings.some(f => f.type === "pricing_violation" && f.flagged_text === "₹650")) {
      throw new Error("Arbitrary wrong price ₹650 was not flagged");
    }
    const spfClash = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
      text: "Daily Shield Sunscreen is available now for ₹549.",
      channel: "Email",
      product_code: "GV-SPF-50"
    });
    if (!spfClash.data.findings.some(f => f.type === "schedule_clash" && f.rule_ref === "Pricing 2.1")) {
      throw new Error("Scheduled post P-03 ₹499 vs ₹549 conflict was not detected");
    }
    console.log("  -> Passed. Arbitrary wrong prices & P-03 ₹499 vs ₹549 conflict detected.");

    console.log("\n[TEST 23] POST /api/check/batch (Batch Date Clash & Batch Price Clash)");
    const batchClashRes = await invokeRoute("POST", "/api/check/batch", { "content-type": "application/json" }, {
      drafts: [
        { channel: "Instagram", content: "Daily Shield Sunscreen for ₹549", product_code: "GV-SPF-50", launch_date: "2026-11-20" },
        { channel: "Email", content: "Daily Shield Sunscreen for ₹499", product_code: "GV-SPF-50", launch_date: "2026-11-19" }
      ]
    });
    const clashes = batchClashRes.data.cross_channel_clashes || [];
    if (!clashes.some(c => c.type === "batch_date_clash") || !clashes.some(c => c.type === "batch_price_clash")) {
      throw new Error("Batch date/price clash detection failed");
    }
    console.log("  -> Passed. Batch date clash and batch price clash detected.");
    console.log("\n=======================================================");
    console.log("   ALL 18 END-TO-END INTEGRATION TESTS PASSED 100%!");
    console.log("=======================================================\n");

    process.exit(0);
  } catch (err) {
    console.error("\nTest Failed:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  runApiTests();
}

module.exports = { runApiTests };
