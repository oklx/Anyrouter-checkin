import Database from "better-sqlite3";
import { mkdirSync } from "fs";

mkdirSync("/data", { recursive: true });
const db = new Database("/data/anyrouter.db");

db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    session TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    memo_account TEXT NOT NULL DEFAULT '',
    memo_password TEXT NOT NULL DEFAULT '',
    memo_apikey TEXT NOT NULL DEFAULT '',
    memo_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    ok INTEGER NOT NULL,
    msg TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS balance_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_remain REAL NOT NULL,
    account_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// 兼容旧库：如果缺少列则自动添加
const cols = db.prepare("PRAGMA table_info(accounts)").all().map(c => c.name);
for (const col of ["memo_account", "memo_password", "memo_apikey", "memo_note",
                    "balance_limit", "balance_used", "balance_remain", "balance_updated_at",
                    "proxy_url"]) {
  if (!cols.includes(col)) {
    const def = col.startsWith("balance_updated") ? "''" : col.startsWith("balance_") ? "NULL" : "''";
    db.exec(`ALTER TABLE accounts ADD COLUMN ${col} ${col.startsWith("balance_") && !col.includes("updated") ? "REAL" : "TEXT"} DEFAULT ${def}`);
  }
}

// 清理 30 天前的余额快照
db.prepare("DELETE FROM balance_snapshots WHERE created_at < datetime('now','localtime','-30 days')").run();

// 默认设置
const defaults = {
  upstream: "https://anyrouter.top",
  cron: "0 9 * * *",
  tg_bot_token: "",
  tg_chat_id: "",
  panel_password: "",
};
const upsert = db.prepare(
  "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING"
);
for (const [k, v] of Object.entries(defaults)) upsert.run(k, v);

export default db;
