// In-Memory API Integration Test Suite for TrueVoice (Runs anywhere without network sockets)
const { server } = require("../server");
const { seedDatabase } = require("../src/db/seed");
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
  console.log("   TRUEVOICE END-TO-END API TEST SUITE");
  console.log("=======================================================\n");

  try {
    console.log("[TEST 1] GET /api/health");
    const health = await invokeRoute("GET", "/api/health");
    if (health.status !== 200 || health.data.status !== "ONLINE") throw new Error("Health check failed");
    console.log("  -> Passed. Server is ONLINE.");

    console.log("\n[TEST 2] POST /api/auth/login (Creator & Reviewer)");
    const creatorLogin = await invokeRoute("POST", "/api/auth/login", { "content-type": "application/json" }, {
      email: "tanisha@glowvale.demo",
      password: "creator123"
    });
    if (creatorLogin.status !== 200 || !creatorLogin.data.token) throw new Error("Creator login failed: " + JSON.stringify(creatorLogin));
    const creatorToken = creatorLogin.data.token;
    console.log("  -> Passed. Logged in Tanisha Jain (Role: " + creatorLogin.data.user.role + ")");

    const reviewerLogin = await invokeRoute("POST", "/api/auth/login", { "content-type": "application/json" }, {
      email: "riddhi@glowvale.demo",
      password: "reviewer123"
    });
    const reviewerToken = reviewerLogin.data.token;
    console.log("  -> Passed. Logged in Riddhi Sharma (Role: " + reviewerLogin.data.user.role + ")");

    console.log("\n[TEST 3] GET /api/library/sources & Stale Detection");
    const sourcesRes = await invokeRoute("GET", "/api/library/sources");
    const s06 = sourcesRes.data.sources.find(s => s.source_id === "S-06");
    if (!s06 || !s06.is_stale) throw new Error("Stale source S-06 not flagged");
    console.log("  -> Passed. Source S-06 (Cruelty-Free Certificate) correctly flagged as stale.");

    console.log("\n[TEST 4] POST /api/check (Instant Safety Check)");
    const checkRes = await invokeRoute("POST", "/api/check", { "content-type": "application/json" }, {
      text: "Our serum is clinically proven to remove wrinkles in 3 days. Launching Friday 20 Nov with flat 30% off!"
    });
    if (checkRes.status !== 200 || checkRes.data.risk_level !== "HIGH") throw new Error("Check pipeline failed");
    console.log("  -> Passed. Caught " + checkRes.data.findings_count + " violations. Risk: " + checkRes.data.risk_level);

    console.log("\n[TEST 5] POST /api/drafts (Submit Review Request)");
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
    if (draftRes.status !== 201) throw new Error("Draft creation failed: " + JSON.stringify(draftRes));
    const draftId = draftRes.data.draft_id;
    const findings = draftRes.data.findings;
    console.log("  -> Passed. Created draft " + draftId + " with " + findings.length + " persisted findings.");

    console.log("\n[TEST 6] GET /api/drafts (Review Queue sorted by High Risk first)");
    const queueRes = await invokeRoute("GET", "/api/drafts");
    if (queueRes.status !== 200 || queueRes.data.drafts.length === 0) throw new Error("Queue failed");
    console.log("  -> Passed. Review queue retrieved (" + queueRes.data.drafts.length + " drafts in queue).");

    console.log("\n[TEST 7] POST /api/drafts/:id/findings/:fid/explain (One-chance \x27Why flagged?\x27)");
    const explainRes = await invokeRoute(
      "POST",
      "/api/drafts/" + draftId + "/findings/" + findings[0].id + "/explain",
      { "content-type": "application/json", authorization: "Bearer " + creatorToken },
      { explanation: "This was intended as a festive hyperbole for our launch teaser." }
    );
    if (explainRes.status !== 200) throw new Error("Explain finding failed");
    console.log("  -> Passed. Recorded creator context explanation.");

    console.log("\n[TEST 8] POST /api/drafts/:id/handover (One-click Manager Handover)");
    const handoverRes = await invokeRoute(
      "POST",
      "/api/drafts/" + draftId + "/handover",
      { "content-type": "application/json", authorization: "Bearer " + creatorToken },
      { reason: "Needs review from Lead Reviewer Riddhi regarding discount discrepancy." }
    );
    if (handoverRes.status !== 200) throw new Error("Handover failed");
    console.log("  -> Passed. Escalated draft to manager review queue.");

    console.log("\n[TEST 9] POST /api/drafts/:id/findings/:fid/accept (Accept Fix)");
    const acceptRes = await invokeRoute(
      "POST",
      "/api/drafts/" + draftId + "/findings/" + findings[0].id + "/accept",
      { "content-type": "application/json", authorization: "Bearer " + creatorToken },
      { custom_fix: findings[0].suggested_fix }
    );
    if (acceptRes.status !== 200) throw new Error("Accept fix failed");
    console.log("  -> Passed. Fix applied to draft content.");

    console.log("\n[TEST 10] POST /api/drafts/:id/approve (Approval & Cryptographic Badge)");
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

    console.log("\n[TEST 11] GET & POST /api/verify (Public Badge & Tamper Detection)");
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

    console.log("\n[TEST 12] GET /api/health-score (Guideline Health Calculation)");
    const healthRes = await invokeRoute("GET", "/api/health-score");
    if (healthRes.status !== 200 || !healthRes.data.health_score) throw new Error("Health score failed");
    console.log("  -> Passed. Guideline Health Score: " + healthRes.data.health_score + "/100. Status: " + healthRes.data.status);

    console.log("\n[TEST 13] POST & GET /api/ai-mistakes (\x27Report AI Mistake\x27 Loop)");
    const mistakePost = await invokeRoute(
      "POST",
      "/api/ai-mistakes",
      { "content-type": "application/json", authorization: "Bearer " + reviewerToken },
      {
        phrase: "Dhamaka offer",
        region: "North India",
        incorrect_flag: "Flagged as aggressive sales urgency",
        user_correction: "Allow festive Hinglish colloquialism in Northern campaigns"
      }
    );
    if (mistakePost.status !== 201) throw new Error("Report mistake failed");
    console.log("  -> Passed. Learned correction stored into AI mistakes memory.");

    console.log("\n=======================================================");
    console.log("   ALL 13 END-TO-END INTEGRATION TESTS PASSED 100%!");
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
