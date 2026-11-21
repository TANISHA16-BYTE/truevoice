// TrueVoice High-Performance REST API Server
const http = require("node:http");
const config = require("./src/config");
const { getUserFromToken } = require("./src/services/authService");
const { seedDatabase } = require("./src/db/seed");
const { seedPostgresDatabase } = require("./src/db/seed-postgres");

// Controllers & Services
const authCtrl = require("./src/controllers/authController");
const checkCtrl = require("./src/controllers/checkController");
const draftsCtrl = require("./src/controllers/draftsController");
const libraryCtrl = require("./src/controllers/libraryController");
const badgeCtrl = require("./src/controllers/badgeController");
const healthCtrl = require("./src/controllers/healthController");
const mistakesCtrl = require("./src/controllers/mistakesController");
const uploadCtrl = require("./src/controllers/uploadController");
const auditCtrl = require("./src/controllers/auditController");
const usersCtrl = require("./src/controllers/usersController");
const { listScheduledPosts } = require("./src/services/scheduleClashService");
const { generateQRCodeSVG } = require("./src/services/qrService");
const { getOpenApiSpec, getSwaggerHtml } = require("./src/services/docsService");

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  res.end(JSON.stringify(data, null, 2));
}

function handleCors(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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
  const currentUser = token ? await getUserFromToken(token) : null;

  const body = ["POST", "PUT", "PATCH"].includes(method) ? await parseBody(req) : {};

  try {
    // ----------------------------------------------------
    // Swagger Documentation UI & OpenAPI Spec
    // ----------------------------------------------------
    if (pathname === "/docs" || pathname === "/api/docs") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(getSwaggerHtml());
    }
    if (pathname === "/api/openapi.json") {
      return sendJson(res, 200, getOpenApiSpec());
    }

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
        docs_url: config.BASE_URL + "/docs",
        endpoints: [
          "GET  /docs (Interactive Swagger UI)",
          "GET  /api/users (Admin only)",
          "POST /api/users (Admin only)",
          "PATCH /api/users/:id/role (Admin only)",
          "POST /api/auth/login",
          "GET  /api/auth/me",
          "POST /api/check",
          "POST /api/check/batch (Cross-channel batch check)",
          "POST /api/upload (File upload & extraction)",
          "POST /api/drafts",
          "GET  /api/drafts",
          "GET  /api/drafts/:id",
          "POST /api/drafts/:id/findings/:fid/explain",
          "POST /api/drafts/:id/findings/:fid/accept",
          "POST /api/drafts/:id/findings/:fid/dismiss",
          "POST /api/drafts/:id/handover",
          "POST /api/drafts/:id/decision",
          "POST /api/drafts/:id/approve",
          "POST /api/drafts/:id/request-changes",
          "GET  /api/library",
          "PATCH /api/library/:id",
          "GET  /api/library/sources",
          "GET  /api/library/facts",
          "GET  /api/library/prices",
          "GET  /api/library/offers",
          "GET  /api/library/claims",
          "GET  /api/library/terms",
          "GET  /api/library/rules",
          "GET  /api/clash/posts",
          "GET  /api/verify/:badgeCode",
          "GET  /api/verify/:badgeCode/qr (QR Code SVG)",
          "POST /api/verify",
          "GET  /api/health-score",
          "GET  /api/analytics/guideline-health",
          "POST /api/ai-mistakes",
          "GET  /api/ai-mistakes",
          "GET  /api/audit-logs/export?format=csv|json"
        ]
      });
    }

    // ----------------------------------------------------
    // Auth Routes
    // ----------------------------------------------------
    if (pathname === "/api/auth/signup" && method === "POST") {
      const resp = await authCtrl.signup(body);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/auth/login" && method === "POST") {
      const resp = await authCtrl.login(body);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/auth/me" && method === "GET") {
      const resp = authCtrl.getMe(currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // Central Authentication & Role Guards
    // ----------------------------------------------------
    const protectedPath =
      pathname === "/api/check" ||
      pathname === "/api/check/batch" ||
      pathname === "/api/upload" ||
      pathname === "/api/drafts" ||
      pathname.startsWith("/api/drafts/") ||
      pathname === "/api/clash/posts" ||
      pathname === "/api/ai-mistakes" ||
      pathname === "/api/audit-logs/export" ||
      pathname === "/api/users" ||
      pathname.startsWith("/api/users/") ||
      pathname === "/api/library/import-pdf" ||
      (pathname.startsWith("/api/library/") && method === "PATCH");

    if (protectedPath && !currentUser) {
      return sendJson(res, 401, { error: "Authentication required." });
    }

    const reviewerOnly =
      pathname === "/api/audit-logs/export" ||
      (pathname === "/api/ai-mistakes" && method === "GET");

    if (
      reviewerOnly &&
      !["reviewer", "admin"].includes(currentUser?.role)
    ) {
      return sendJson(res, 403, {
        error: "Reviewer or admin permission required."
      });
    }

    // ----------------------------------------------------
    // Admin Team & Role Management Routes
    // ----------------------------------------------------
    if (pathname === "/api/users" && method === "GET") {
      const resp = await usersCtrl.listUsers(currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/users" && method === "POST") {
      const resp = await usersCtrl.createTeamUser(body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    const userRoleMatch = pathname.match(/^\/api\/users\/([A-Za-z0-9_-]+)\/role$/);
    if (userRoleMatch && method === "PATCH") {
      const resp = await usersCtrl.updateUserRole(userRoleMatch[1], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // Checking Routes (Live & Batch)
    // ----------------------------------------------------
    if (pathname === "/api/check" && method === "POST") {
      const resp = await checkCtrl.checkContent(body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/check/batch" && method === "POST") {
      const resp = await checkCtrl.checkBatch(body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/upload" && method === "POST") {
      const resp = await uploadCtrl.handleFileUpload(body, currentUser);
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
      const resp = await draftsCtrl.listDrafts(query, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    // Draft specific subroutes: /api/drafts/:id/...
    const draftDetailMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)$/);
    if (draftDetailMatch && method === "GET") {
      const resp = await draftsCtrl.getDraftDetails(draftDetailMatch[1], currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const explainMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/findings\/([A-Za-z0-9_]+)\/explain$/);
    if (explainMatch && method === "POST") {
      const resp = await draftsCtrl.explainFinding(explainMatch[1], explainMatch[2], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const acceptMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/findings\/([A-Za-z0-9_]+)\/accept$/);
    if (acceptMatch && method === "POST") {
      const resp = await draftsCtrl.acceptFindingFix(acceptMatch[1], acceptMatch[2], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const dismissMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/findings\/([A-Za-z0-9_]+)\/dismiss$/);
    if (dismissMatch && method === "POST") {
      const resp = await draftsCtrl.dismissFinding(dismissMatch[1], dismissMatch[2], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const handoverMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/handover$/);
    if (handoverMatch && method === "POST") {
      const resp = await draftsCtrl.handoverToManager(handoverMatch[1], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const decisionMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/decision$/);
    if (decisionMatch && method === "POST") {
      const resp = await draftsCtrl.decideDraft(decisionMatch[1], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const approveMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/approve$/);
    if (approveMatch && method === "POST") {
      const resp = await draftsCtrl.approveDraft(approveMatch[1], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    const changeRequestMatch = pathname.match(/^\/api\/drafts\/([A-Za-z0-9_]+)\/request-changes$/);
    if (changeRequestMatch && method === "POST") {
      const resp = await draftsCtrl.requestChanges(changeRequestMatch[1], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // Knowledge Base Library Routes
    // ----------------------------------------------------
    if (pathname === "/api/library" && method === "GET") {
      const resp = await libraryCtrl.getUnifiedLibrary();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/import-pdf" && method === "POST") {
      const resp = await uploadCtrl.handleBrandGuideImport(body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    const patchLibraryMatch = pathname.match(/^\/api\/library\/([^/]+)$/);
    if (patchLibraryMatch && method === "PATCH") {
      const resp = await libraryCtrl.patchLibraryItem(patchLibraryMatch[1], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }

    if (pathname === "/api/library/sources" && method === "GET") {
      const resp = await libraryCtrl.getSources();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/facts" && method === "GET") {
      const resp = await libraryCtrl.getFacts(query);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/facts" && method === "POST") {
      const resp = await libraryCtrl.createFact(body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    const factMatch = pathname.match(/^\/api\/library\/facts\/([A-Za-z0-9_-]+)$/);
    if (factMatch && method === "PUT") {
      const resp = await libraryCtrl.updateFact(factMatch[1], body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    if (factMatch && method === "DELETE") {
      const resp = await libraryCtrl.archiveFact(factMatch[1], currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/prices" && method === "GET") {
      const resp = await libraryCtrl.getPrices(query);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/offers" && method === "GET") {
      const resp = await libraryCtrl.getOffers(query);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/claims" && method === "GET") {
      const resp = await libraryCtrl.getClaims(query);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/terms" && method === "GET") {
      const resp = await libraryCtrl.getTerms(query);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/rules" && method === "GET") {
      const resp = await libraryCtrl.getRules();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/protected-names" && method === "GET") {
      const resp = await libraryCtrl.getProtectedNames();
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/library/regional-notes" && method === "GET") {
      const resp = await libraryCtrl.getRegionalNotes();
      return sendJson(res, resp.status, resp.data);
    }
    const libraryItemMatch = pathname.match(/^\/api\/library\/(prices|offers|claims|terms)(?:\/([A-Za-z0-9_-]+))?$/);
    if (libraryItemMatch) {
      const kind = libraryItemMatch[1];
      const itemId = libraryItemMatch[2];
      if (!itemId && method === "POST") {
        const resp = await libraryCtrl.createItem(kind, body, currentUser);
        return sendJson(res, resp.status, resp.data);
      }
      if (itemId && method === "PUT") {
        const resp = await libraryCtrl.updateItem(kind, itemId, body, currentUser);
        return sendJson(res, resp.status, resp.data);
      }
      if (itemId && method === "DELETE") {
        const resp = await libraryCtrl.archiveItem(kind, itemId, currentUser);
        return sendJson(res, resp.status, resp.data);
      }
    }

    // ----------------------------------------------------
    // Cross-Channel Scheduled Posts
    // ----------------------------------------------------
    if (pathname === "/api/clash/posts" && method === "GET") {
      const posts = await listScheduledPosts();
      return sendJson(res, 200, { scheduled_posts: posts });
    }

    // ----------------------------------------------------
    // Verification & Proof-of-Approval Badge Routes
    // ----------------------------------------------------
    const qrMatch = pathname.match(/^\/api\/verify\/([A-Za-z0-9_-]+)\/qr$/);
    if (qrMatch && method === "GET") {
      const badgeCode = qrMatch[1];
      const verifyUrl = config.BASE_URL + "/verify/" + badgeCode;
      const svg = generateQRCodeSVG(verifyUrl, 250);
      res.writeHead(200, {
        "Content-Type": "image/svg+xml",
        "Access-Control-Allow-Origin": "*"
      });
      return res.end(svg);
    }

    const verifyMatch = pathname.match(/^\/api\/verify\/([A-Za-z0-9_-]+)$/) || pathname.match(/^\/verify\/([A-Za-z0-9_-]+)$/);
    if (verifyMatch && method === "GET") {
      const resp = await badgeCtrl.getBadgeVerification(verifyMatch[1]);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/verify" && method === "POST") {
      const resp = await badgeCtrl.verifyContentIntegrity(body);
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // Guideline Health Score
    // ----------------------------------------------------
    if ((pathname === "/api/health-score" || pathname === "/api/analytics/guideline-health") && method === "GET") {
      const resp = await healthCtrl.getGuidelineHealth();
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // "Report AI Mistake" Learning Loop
    // ----------------------------------------------------
    if (pathname === "/api/ai-mistakes" && method === "POST") {
      const resp = await mistakesCtrl.submitAiMistake(body, currentUser);
      return sendJson(res, resp.status, resp.data);
    }
    if (pathname === "/api/ai-mistakes" && method === "GET") {
      const resp = await mistakesCtrl.getMistakes();
      return sendJson(res, resp.status, resp.data);
    }

    // ----------------------------------------------------
    // Audit Trail Export
    // ----------------------------------------------------
    if (pathname === "/api/audit-logs/export" && method === "GET") {
      const resp = await auditCtrl.exportAuditLogs(query);
      if (resp.contentType === "text/csv") {
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Access-Control-Allow-Origin": "*",
          ...resp.headers
        });
        return res.end(resp.raw);
      }
      return sendJson(res, resp.status, resp.data);
    }

    // 404 Fallback
    return sendJson(res, 404, { error: "Route " + method + " " + pathname + " not found" });
  } catch (err) {
    console.error("Internal Server Error:", err);
    return sendJson(res, 500, { error: "Internal server error" });
  }
});

function startServer(port = config.PORT) {
  return new Promise((resolve) => {
    server.listen(port, config.HOST, () => {
      console.log(`TrueVoice API Server running at http://${config.HOST}:${port}`);
      console.log(`Interactive Swagger Docs at http://${config.HOST}:${port}/docs`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  (async () => {
    try {
      if (config.DATABASE_URL) await seedPostgresDatabase();
      else seedDatabase();
      await startServer();
    } catch (error) {
      console.error("TrueVoice startup failed:", error);
      process.exitCode = 1;
    }
  })();
}

module.exports = { server, startServer };