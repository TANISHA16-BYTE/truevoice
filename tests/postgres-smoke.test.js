// Safe PostgreSQL smoke test. Runs only against the isolated CI service database.
const assert = require("node:assert/strict");
const db = require("../src/db/database");

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

  console.log("PostgreSQL smoke test passed: connection, schema, and parameter binding.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close();
  });
