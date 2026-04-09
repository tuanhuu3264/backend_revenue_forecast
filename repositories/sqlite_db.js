const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

/**
 * @param {string} sqlitePath Path relative to BE cwd or absolute
 */
function openDatabase(sqlitePath) {
  const resolved = path.isAbsolute(sqlitePath)
    ? sqlitePath
    : path.join(process.cwd(), sqlitePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(resolved);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS forecast_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      trigger_source TEXT NOT NULL,
      user_id INTEGER,
      prompt TEXT,
      agent_provider TEXT,
      forecast_json TEXT NOT NULL,
      insights_json TEXT NOT NULL,
      analysis_json TEXT,
      overall_insight TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_forecast_reports_created_at ON forecast_reports(created_at);
  `);
  const frCols = db.prepare("PRAGMA table_info(forecast_reports)").all();
  const frNames = new Set(frCols.map((c) => c.name));
  if (!frNames.has("revenue_series_json")) {
    db.exec(
      "ALTER TABLE forecast_reports ADD COLUMN revenue_series_json TEXT"
    );
  }
  return db;
}

module.exports = { openDatabase };
