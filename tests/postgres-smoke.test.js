// Safe PostgreSQL smoke test. Runs only against the isolated CI service database.
const assert = require("node:assert/strict");
const db = require("../src/db/database");
const { seedPostgresDatabase } = require("../src/db/seed-postgres");
const { authenticateUser } = require("../src/services/authService");
const { runCheckPipeline } = require("../src/services/checkPipeline");
const draftsController = require("../src/controllers/draftsController");
const libraryController = require("../src/controllers/libraryController");
const { verifyBadgeAndContent } = require("../src/services/approvalBadgeService");

async function main() {
  assert.equal(db.isPostgres, true, "CI smoke test must use PostgreSQL");

  const version = await db.get("SELECT version() AS version");
  assert.match(version.version, /PostgreSQL/i);

  const expectedTables = [
    "users", "sources", "facts", "prices", "offers", "claims", "terms",
    "rules", "scheduled_posts", "protected_names", "regional_notes",
    "ai_mistakes", "drafts", "findings", "approval_badges", "draft_history"
  ];

  const rows = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
  );
  const actual = new Set(rows.map((row) => row.table_name));
  for (const table of expectedTables) {
    assert.ok(actual.has(table), `Missing PostgreSQL table: ${table}`);
  }

  const parameterized = await db.get(
    "SELECT ?::text AS first_value, ?::integer AS second_value",
    ["truevoice", 42]
  );
  assert.deepEqual(parameterized, { first_value: "truevoice", second_value: 42 });

  const columns = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'drafts'"
  );
  const draftColumns = new Set(columns.map((row) => row.column_name));
  for (const column of ["id", "creator_id", "handover_to_manager", "updated_at"]) {
    assert.ok(draftColumns.has(column), `Missing drafts column: ${column}`);
  }

  // Seed only the disposable CI database. The seeder is additive and uses ON CONFLICT DO NOTHING.\n  await seedPostgresDatabase();\n\n  const seededUsers = await db.get("SELECT COUNT(*)::int AS count FROM users");\n  const seededSources = await db.get("SELECT COUNT(*)::int AS count FROM sources");\n  const seededFacts = await db.get("SELECT COUNT(*)::int AS count FROM facts");\n  assert.ok(seededUsers.count >= 3, "Demo users were not seeded");\n  assert.ok(seededSources.count > 0, "Approved sources were not seeded");\n  assert.ok(seededFacts.count > 0, "Approved facts were not seeded");\n\n  const login = await authenticateUser("tanisha@glowvale.demo", "creator123");\n  assert.ok(login && login.user.role === "creator", "PostgreSQL demo login failed");\n  assert.ok(login.token, "Authentication did not issue a token");\n\n  const pipeline = await runCheckPipeline({\n    text: "A simple skincare routine for everyday use.",\n    channel: "Instagram",\n    product_code: "GV-SER-30"\n  });\n  assert.ok(["LOW", "MEDIUM", "HIGH"].includes(pipeline.risk_level));\n  assert.ok(Array.isArray(pipeline.findings));\n\n  const reviewerLogin = await authenticateUser("riddhi@glowvale.demo", "reviewer123");\n  assert.ok(reviewerLogin && reviewerLogin.user.role === "reviewer", "PostgreSQL reviewer login failed");\n\n  const library = await libraryController.getUnifiedLibrary();\n  assert.equal(library.status, 200);\n  assert.ok(library.data.sources.length > 0);\n  assert.ok(library.data.facts.length > 0);\n\n  const created = await draftsController.createDraft({\n    title: "PostgreSQL isolated CI draft",\n    content: "A simple skincare routine for everyday use.",\n    channel: "Instagram",\n    product_code: "GV-SER-30"\n  }, login.user);\n  assert.equal(created.status, 201, JSON.stringify(created.data));\n  const draftId = created.data.draft_id;\n\n  const listed = await draftsController.listDrafts({}, login.user);\n  assert.equal(listed.status, 200);\n  assert.ok(listed.data.drafts.some((draft) => draft.id === draftId));\n\n  const details = await draftsController.getDraftDetails(draftId, reviewerLogin.user);\n  assert.equal(details.status, 200);\n\n  const approved = await draftsController.approveDraft(draftId, { note: "CI isolated approval" }, reviewerLogin.user);\n  assert.equal(approved.status, 200, JSON.stringify(approved.data));\n  assert.ok(approved.data.badge.badge_code);\n\n  const verification = await verifyBadgeAndContent(approved.data.badge.badge_code, "A simple skincare routine for everyday use.");\n  assert.equal(verification.found, true);\n  assert.equal(verification.submitted_content_verification.matches, true);\n\n  console.log("PostgreSQL integration smoke test passed: schema, idempotent seed, demo auth, library reads, draft create/list/detail, approval badge, and content verification.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close();
  });
