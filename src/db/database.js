// SQLite Database Client using Node.js built-in node:sqlite
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");
const config = require("../config");

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(config.DATABASE_PATH);
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");
    
    // Auto-run schema
    const schemaPath = path.join(__dirname, "schema.sql");
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, "utf-8");
      dbInstance.exec(schemaSql);
    }
        // Library management columns (safe to run on every start)
    const addColumnIfMissing = (table, column, definition) => {
      const cols = dbInstance.prepare("PRAGMA table_info(" + table + ")").all().map((c) => c.name);
      if (!cols.includes(column)) {
        dbInstance.exec("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
      }
    };
    addColumnIfMissing("facts", "owner", "TEXT");
    addColumnIfMissing("facts", "status", "TEXT NOT NULL DEFAULT 'active'");
    for (const table of ["prices", "offers", "claims", "terms"]) {
      addColumnIfMissing(table, "owner", "TEXT");
      addColumnIfMissing(table, "archived", "INTEGER NOT NULL DEFAULT 0");
      addColumnIfMissing(table, "last_checked", "TEXT");
    }
  }
  return dbInstance;
}

const db = {
  getRawDb: getDb,
  
  query(sql, params = []) {
    const database = getDb();
    const stmt = database.prepare(sql);
    return stmt.all(...params);
  },
  
  get(sql, params = []) {
    const database = getDb();
    const stmt = database.prepare(sql);
    return stmt.get(...params);
  },
  
  run(sql, params = []) {
    const database = getDb();
    const stmt = database.prepare(sql);
    return stmt.run(...params);
  },
  
  exec(sql) {
    const database = getDb();
    return database.exec(sql);
  }
};

module.exports = db;
