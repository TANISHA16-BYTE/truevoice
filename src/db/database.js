// Dual database adapter: SQLite for local/tests, PostgreSQL for hosted deployments.
const fs = require("fs");
const path = require("path");
const config = require("../config");

const usePostgres = Boolean(config.DATABASE_URL);
let dbInstance = null;
let pool = null;

function getDb() {
  if (usePostgres) {
    if (!pool) {
      const { Pool } = require("pg");
      pool = new Pool({
        connectionString: config.DATABASE_URL,
        ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
        max: Number(process.env.DB_POOL_MAX || 5),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });
      pool.on("error", (error) => {
        console.error("Unexpected PostgreSQL pool error:", error.message);
      });
    }
    return pool;
  }

  if (!dbInstance) {
    const { DatabaseSync } = require("node:sqlite");
    dbInstance = new DatabaseSync(config.DATABASE_PATH);
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");

    const schemaPath = path.join(__dirname, "schema.sql");
    if (fs.existsSync(schemaPath)) {
      dbInstance.exec(fs.readFileSync(schemaPath, "utf-8"));
    }

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

// Convert positional SQLite placeholders to PostgreSQL placeholders without
// changing question marks inside quoted strings or SQL comments.
function toPostgresPlaceholders(sql) {
  let out = "";
  let index = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      out += ch;
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      out += ch;
      if (ch === "*" && next === "/") {
        out += "/";
        i++;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      out += ch;
      if (ch === quote) {
        if (next === quote) {
          out += next;
          i++;
        } else {
          quote = null;
        }
      } else if (ch === "\\" && quote !== "]" && i + 1 < sql.length) {
        out += sql[++i];
      }
      continue;
    }
    if (ch === "-" && next === "-") {
      out += "--";
      i++;
      lineComment = true;
    } else if (ch === "/" && next === "*") {
      out += "/*";
      i++;
      blockComment = true;
    } else if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      out += ch;
    } else if (ch === "?") {
      out += "$" + (++index);
    } else {
      out += ch;
    }
  }
  return out;
}

const db = {
  isPostgres: usePostgres,
  getRawDb: getDb,

  query(sql, params = []) {
    if (usePostgres) {
      return getDb().query(toPostgresPlaceholders(sql), params).then((result) => result.rows);
    }
    const stmt = getDb().prepare(sql);
    return stmt.all(...params);
  },

  get(sql, params = []) {
    if (usePostgres) {
      return getDb().query(toPostgresPlaceholders(sql), params).then((result) => result.rows[0] || null);
    }
    return getDb().prepare(sql).get(...params);
  },

  run(sql, params = []) {
    if (usePostgres) {
      return getDb().query(toPostgresPlaceholders(sql), params).then((result) => ({
        changes: result.rowCount,
        lastInsertRowid: null
      }));
    }
    return getDb().prepare(sql).run(...params);
  },

  exec(sql) {
    if (usePostgres) return getDb().query(sql);
    return getDb().exec(sql);
  },

  async close() {
    if (usePostgres && pool) {
      const current = pool;
      pool = null;
      await current.end();
    } else if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
  }
};

module.exports = db;
