// TrueVoice High-Performance REST API Server
const http = require("node:http");
const url = require("node:url");
const config = require("./src/config");
const { getUserFromToken } = require("./src/services/authService");
const { seedDatabase } = require("./src/db/seed");

// Controllers
const authCtrl = require("./src/controllers/authController");
const checkCtrl = require("./src/controllers/checkController");
const draftsCtrl = require("./src/controllers/draftsController");
const libraryCtrl = require("./src/controllers/libraryController");
const badgeCtrl = require("./src/controllers/badgeController");
const healthCtrl = require("./src/controllers/healthController");
const mistakesCtrl = require("./src/controllers/mistakesController");
const { listScheduledPosts } = require("./src/services/scheduleClashService");

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(data, null, 2));
}

function handleCors(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end();
    return true;
  }
  return false;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (handleCors(req, res)) return;

  const reqUrl = new URL(req.url, "http://localhost:8000");
  const pathname = reqUrl.pathname;
  const method = req.method;
  const query = Object.fromEntries(reqUrl.searchParams.entries());

  // Extract auth user
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const currentUser = token ? getUserFromToken(token) : null;

  const body = ["POST", "PUT", "PATCH"].includes(method) ? await parseBody(req) : {};

  try {
    // ----------------------------------------------------
    // Root & API Info
    // ----------------------------------------------------
    if (pathname === "/" || pathname === "/api" || pathname === "/api/health") {
      return sendJson(res, 200, {
        app: "TrueVoice REST API",
        team: "DevVibe (Tanisha, Riddhi, Siddhi, Nupur)",
        version: "1.0.0",
        demo_date: config.DEMO_DATE,
        status: "ONLINE",
        endpoints: [
          "POST /api/auth/login",
          "GET  /api/auth/me",
          "POST /api/check",
          "POST /api/drafts",
          "GET  /api/drafts",
          "GET  /api/drafts/:id",
          "POST /api/drafts/:id/findings/:fid/explain",
          "POST /api/drafts/:id/findings/:fid/accept",
          "POST /api/drafts/:id/findings/:fid/dismiss",
          "POST /api/drafts/:id/handover",
          "POST /api/drafts/:id/approve",
          "POST /api/drafts/:id/request-changes",
          "GET  /api/library/sources",
          "GET  /api/library/facts",
          "GET  /api/library/prices",
          "GET  /api/library/offers",
          "GET  /api/library/claims",
          "GET  /api/library/terms",
          "GET  /api/library/rules",
          "GET  /api/clash/posts",
          "GET  /api/verify/:badgeCode",
          "POST /api/verify",
          "GET  /api/health-score",
          "POST /api/ai-mistakes",
          "GET  /api/ai-mistakes"
        ]
      });
    }

    // ----------------------------------------------------
    // Auth Routes
    // ----------------------------------------------------
    if (pathname === "/api/auth/login" && method === "POST") {
      const resp = authCtrl.login(body);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/auth/me" && method === "GET") {
      const resp = authCtrl.getMe(currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // Checking Routes
    // ----------------------------------------------------
    if (pathname === "/api/check" && method === "POST") {
      const resp = await checkCtrl.checkContent(body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // Drafts & Review Queue Routes
    // ----------------------------------------------------
    if (pathname === "/api/drafts" && method === "POST") {
      const resp = await draftsCtrl.createDraft(body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/drafts" && method === "GET") {
      const resp = draftsCtrl.listDrafts(query);
      return sendJson(res, resp.status, resp.data);
    }

    // Draft specific subroutes: /api/drafts/:id/...
    const draftDetailMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)$/);
    if (draftDetailMatch && method === "GET") {
      const resp = draftsCtrl.getDraftDetails(draftDetailMatch[1]);
      return sendJson(res, resp.status, resp.data);
    }

    const explainMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/findings\/([A-Za-z0-9_]+)\/explain$/);
    if (explainMatch && method === "POST") {
      const resp = draftsCtrl.explainFinding(explainMatch[1], explainMatch[2], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const acceptMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/findings\/([A-Za-z0-9_]+)\/accept$/);
    if (acceptMatch && method === "POST") {
      const resp = await draftsCtrl.acceptFindingFix(acceptMatch[1], acceptMatch[2], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const dismissMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/findings\/([A-Za-z0-9_]+)\/dismiss$/);
    if (dismissMatch && method === "POST") {
      const resp = draftsCtrl.dismissFinding(dismissMatch[1], dismissMatch[2], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const handoverMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/handover$/);
    if (handoverMatch && method === "POST") {
      const resp = draftsCtrl.handoverToManager(handoverMatch[1], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const approveMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/approve$/);
    if (approveMatch && method === "POST") {
      const resp = draftsCtrl.approveDraft(approveMatch[1], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const changeRequestMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/request-changes$/);
    if (changeRequestMatch && method === "POST") {
      const resp = draftsCtrl.requestChanges(changeRequestMatch[1], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // Knowledge Base Library Routes
    // ----------------------------------------------------
    if (pathname === "/api/library/sources" && method === "GET") {
      const resp = libraryCtrl.getSources();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/facts" && method === "GET") {
      const resp = libraryCtrl.getFacts();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/prices" && method === "GET") {
      const resp = libraryCtrl.getPrices();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/offers" && method === "GET") {
      const resp = libraryCtrl.getOffers();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/claims" && method === "GET") {
      const resp = libraryCtrl.getClaims();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/terms" && method === "GET") {
      const resp = libraryCtrl.getTerms();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/rules" && method === "GET") {
      const resp = libraryCtrl.getRules();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/protected-names" && method === "GET") {
      const resp = libraryCtrl.getProtectedNames();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/regional-notes" && method === "GET") {
      const resp = libraryCtrl.getRegionalNotes();
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // Cross-Channel Scheduled Posts
    // ----------------------------------------------------
    if (pathname === "/api/clash/posts" && method === "GET") {
      const posts = listScheduledPosts();
      return sendJson(res, 200, { scheduled_posts: posts });
    }

    // ----------------------------------------------------
    // Verification & Proof-of-Approval Badge Routes
    // ----------------------------------------------------
    const verifyMatch = pathname.match(/^\/api\/verify\/([A-Za-z0-9_-]+)$/) || pathname.match(/^\/verify\/([A-Za-z0-9_-]+)$/);
    if (verifyMatch && method === "GET") {
      const resp = badgeCtrl.getBadgeVerification(verifyMatch[1]);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/verify" && method === "POST") {
      const resp = badgeCtrl.verifyContentIntegrity(body);
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // Guideline Health Score
    // ----------------------------------------------------
    if (pathname === "/api/health-score" && method === "GET") {
      const resp = healthCtrl.getGuidelineHealth();
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // "Report AI Mistake" Learning Loop
    // ----------------------------------------------------
    if (pathname === "/api/ai-mistakes" && method === "POST") {
      const resp = mistakesCtrl.submitAiMistake(body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/ai-mistakes" && method === "GET") {
      const resp = mistakesCtrl.getMistakes();
      return sendJson(res, resp.status, resp.data);
    }

    // 404 Fallback
    return sendJson(res, 404, { error: "Route " + method + " " + pathname + " not found" });
  } catch (err) {
    console.error("Internal Server Error:", err);
    return sendJson(res, 500, { error: "Internal server error", details: err.message });
  }
});

function startServer(port = config.PORT) {
  return new Promise((resolve) => {
    server.listen(port, config.HOST, () => {
      console.log(`TrueVoice API Server running at http://${config.HOST}:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  seedDatabase();
  startServer();
}

module.exports = { server, startServer };
