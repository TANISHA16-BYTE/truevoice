// Interactive API Documentation (Swagger & OpenAPI Spec)
const config = require("../config");

function getOpenApiSpec() {
  return {
    openapi: "3.0.0",
    info: {
      title: "TrueVoice REST API",
      version: "1.0.0",
      description: "Automated content compliance, exact-rule verification, and tamper-proof approval badges for Glowvale Skincare."
    },
    servers: [{ url: config.BASE_URL }],
    paths: {
      "/api/health": {
        get: { summary: "Health check and system status", responses: { 200: { description: "System status" } } }
      },
      "/api/auth/login": {
        post: {
          summary: "Authenticate user and get JWT token",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { email: { type: "string" }, password: { type: "string" } } } } } },
          responses: { 200: { description: "JWT Token and user profile" } }
        }
      },
      "/api/check": {
        post: {
          summary: "Instant live safety check on text without saving",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { text: { type: "string" } } } } } },
          responses: { 200: { description: "Risk level, findings, and rule citations" } }
        }
      },
      "/api/check/batch": {
        post: {
          summary: "Batch scan multiple drafts across social channels for schedule and message clashes",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { drafts: { type: "array" } } } } } },
          responses: { 200: { description: "Batch check findings and channel alignment" } }
        }
      },
      "/api/drafts": {
        get: { summary: "Get review queue sorted with HIGH risk first", responses: { 200: { description: "List of drafts" } } },
        post: { summary: "Submit a new draft for human review", responses: { 201: { description: "Draft created" } } }
      },
      "/api/drafts/{id}/findings/{fid}/explain": {
        post: { summary: "Creator one-chance \"Why flagged?\" intent explanation", responses: { 200: { description: "Context recorded" } } }
      },
      "/api/drafts/{id}/handover": {
        post: { summary: "One-click manager handover button", responses: { 200: { description: "Draft escalated to human reviewer" } } }
      },
      "/api/drafts/{id}/approve": {
        post: { summary: "Reviewer approves draft and generates SHA-256 badge", responses: { 200: { description: "Approval badge and verification link" } } }
      },
      "/api/verify/{badgeCode}": {
        get: { summary: "Public proof-of-approval verification lookup", responses: { 200: { description: "Badge details" } } }
      },
      "/api/verify": {
        post: {
          summary: "Content integrity tamper detection (compares text hash with signed record)",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { badge_code: { type: "string" }, content: { type: "string" } } } } } },
          responses: { 200: { description: "VERIFIED_AUTHENTIC or MODIFIED_TAMPERED warning" } }
        }
      },
      "/api/health-score": {
        get: { summary: "Get Guideline Health Score and rule friction analytics", responses: { 200: { description: "Health score and unclear rule recommendations" } } }
      },
      "/api/ai-mistakes": {
        get: { summary: "List learned AI regional corrections", responses: { 200: { description: "List of corrections" } } },
        post: { summary: "Report AI mistake feedback loop", responses: { 201: { description: "Saved correction" } } }
      },
      "/api/audit-logs/export": {
        get: { summary: "Export full regulatory compliance audit log (JSON or CSV)", responses: { 200: { description: "Audit trail log" } } }
      }
    }
  };
}

function getSwaggerHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>TrueVoice REST API Interactive Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; background: #0F172A; }
    .topbar { display: none !important; }
    .swagger-ui .info .title { color: #38BDF8 !important; }
    .swagger-ui { max-width: 1200px; margin: 0 auto; padding: 20px; background: #FFFFFF; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <div style="background: #0F172A; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0; font-family: sans-serif; color: #38BDF8;">🛡️ TrueVoice REST API</h1>
    <p style="margin: 5px 0 0; color: #94A3B8; font-family: sans-serif;">DevVibe Hackathon Interactive Backend Documentation & Sandbox</p>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis]
      });
    };
  </script>
</body>
</html>`;
}

module.exports = { getOpenApiSpec, getSwaggerHtml };
