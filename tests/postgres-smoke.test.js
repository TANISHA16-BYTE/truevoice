// Safe PostgreSQL smoke test. Runs only against the isolated CI service database.
const assert = require("node:assert/strict");
const db = require("../src/db/database");
const { seedPostgresDatabase } = require("../src/db/seed-postgres");
const { authenticateUser } = require("../src/services/authService");
const { runCheckPipeline } = require("../src/services/checkPipeline");

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

  // Seed only the disposable CI database. The seeder is additive and uses ON CONFLICT DO NOTHING.\n  await seedPostgresDatabase();\n\n  const seededUsers = await db.get("SELECT COUNT(*)::int AS count FROM users");\n  const seededSources = await db.get("SELECT COUNT(*)::int AS count FROM sources");\n  const seededFacts = await db.get("SELECT COUNT(*)::int AS count FROM facts");\n  assert.ok(seededUsers.count >= 3, "Demo users were not seeded");\n  assert.ok(seededSources.count > 0, "Approved sources were not seeded");\n  assert.ok(seededFacts.count > 0, "Approved facts were not seeded");\n\n  const login = await authenticateUser("tanisha@glowvale.demo", "creator123");\n  assert.ok(login && login.user.role === "creator", "PostgreSQL demo login failed");\n  assert.ok(login.token, "Authentication did not issue a token");\n\n  const pipeline = await runCheckPipeline({\n    text: "A simple skincare routine for everyday use.",\n    channel: "Instagram",\n    product_code: "GV-SER-30"\n  });\n  assert.ok(["LOW", "MEDIUM", "HIGH"].includes(pipeline.risk_level));\n  assert.ok(Array.isArray(pipeline.findings));\n\n  console.log("PostgreSQL integration smoke test passed: connection, schema, seed, login, and full read-only check pipeline.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close();
  });
