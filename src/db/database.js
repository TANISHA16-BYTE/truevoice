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
