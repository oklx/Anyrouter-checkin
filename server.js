import express from "express";
import cron from "node-cron";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import db from "./db.js";
import { signIn, sendTelegram, queryBalance } from "./checkin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// ========== 工具函数 ==========

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  return row ? row.value : "";
}

function getAllSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function recordBalanceSnapshot() {
  const row = db.prepare(
    "SELECT COUNT(*) as cnt, COALESCE(SUM(balance_remain),0) as total FROM accounts WHERE balance_remain IS NOT NULL"
  ).get();
  db.prepare(
    "INSERT INTO balance_snapshots(total_remain, account_count, created_at) VALUES(?,?,datetime('now','localtime'))"
  ).run(Math.round(row.total * 100) / 100, row.cnt);
}

// ========== 密码中间件 ==========

app.post("/api/login", (req, res) => {
  const { password } = req.body;
  const pwd = getSetting("panel_password");
  if (!pwd) return res.json({ ok: true });
  if (password === pwd) return res.json({ ok: true });
  res.status(401).json({ error: "密码错误" });
});

function authMiddleware(req, res, next) {
  const pwd = getSetting("panel_password");
  if (!pwd) return next();
  const token = req.headers["x-panel-password"] || "";
  if (token === pwd) return next();
  res.status(401).json({ error: "未授权" });
}

app.use("/api/accounts", authMiddleware);
app.use("/api/logs", authMiddleware);
app.use("/api/settings", authMiddleware);
app.use("/api/checkin", authMiddleware);
app.use("/api/balance", authMiddleware);
app.use("/api/stats", authMiddleware);

// ========== 账号 API（分页）==========

app.get("/api/accounts", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = Math.min(Math.max(1, parseInt(req.query.per_page) || 10), 100);
  const total = db.prepare("SELECT COUNT(*) as cnt FROM accounts").get().cnt;
  const offset = (page - 1) * perPage;
  const rows = db.prepare(
    `SELECT id, name, session, enabled, memo_account, memo_password, memo_apikey, memo_note,
     proxy_url, balance_remain, balance_updated_at,
     created_at, updated_at FROM accounts ORDER BY id LIMIT ? OFFSET ?`
  ).all(perPage, offset);

  // 获取每个账号最近一条日志的状态
  const lastLogStmt = db.prepare(
    "SELECT ok FROM logs WHERE account_id=? ORDER BY id DESC LIMIT 1"
  );

  const safe = rows.map((r) => {
    const lastLog = lastLogStmt.get(r.id);
    return {
      ...r,
      session: r.session.slice(0, 6) + "***" + r.session.slice(-4),
      status: lastLog ? (lastLog.ok ? "ok" : "error") : "unknown",
    };
  });
  res.json({ rows: safe, total, page, per_page: perPage });
});

app.post("/api/accounts", (req, res) => {
  const { name, session, memo_account, memo_password, memo_apikey, memo_note, proxy_url } = req.body;
  if (!session || !session.trim()) return res.status(400).json({ error: "session 不能为空" });
  const info = db.prepare(
    `INSERT INTO accounts(name, session, memo_account, memo_password, memo_apikey, memo_note, proxy_url)
     VALUES(?,?,?,?,?,?,?)`
  ).run(name || "", session.trim(), memo_account || "", memo_password || "", memo_apikey || "", memo_note || "", proxy_url || "");
  res.json({ id: info.lastInsertRowid });
});

app.put("/api/accounts/:id", (req, res) => {
  const { name, session, enabled, memo_account, memo_password, memo_apikey, memo_note, proxy_url } = req.body;
  const acc = db.prepare("SELECT * FROM accounts WHERE id=?").get(req.params.id);
  if (!acc) return res.status(404).json({ error: "账号不存在" });
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push("name=?"); params.push(name); }
  if (session !== undefined && session.trim()) { updates.push("session=?"); params.push(session.trim()); }
  if (enabled !== undefined) { updates.push("enabled=?"); params.push(enabled ? 1 : 0); }
  if (memo_account !== undefined) { updates.push("memo_account=?"); params.push(memo_account); }
  if (memo_password !== undefined) { updates.push("memo_password=?"); params.push(memo_password); }
  if (memo_apikey !== undefined) { updates.push("memo_apikey=?"); params.push(memo_apikey); }
  if (memo_note !== undefined) { updates.push("memo_note=?"); params.push(memo_note); }
  if (proxy_url !== undefined) { updates.push("proxy_url=?"); params.push(proxy_url); }
  if (updates.length === 0) return res.json({ ok: true });
  updates.push("updated_at=datetime('now','localtime')");
  params.push(req.params.id);
  db.prepare(`UPDATE accounts SET ${updates.join(",")} WHERE id=?`).run(...params);
  res.json({ ok: true });
});

app.delete("/api/accounts/:id", (req, res) => {
  db.prepare("DELETE FROM accounts WHERE id=?").run(req.params.id);
  db.prepare("DELETE FROM logs WHERE account_id=?").run(req.params.id);
  res.json({ ok: true });
});

// ========== 余额查询 ==========

app.get("/api/balance/:id", async (req, res) => {
  const acc = db.prepare("SELECT * FROM accounts WHERE id=?").get(req.params.id);
  if (!acc) return res.status(404).json({ error: "账号不存在" });
  const upstream = getSetting("upstream") || "https://anyrouter.top";
  const result = await queryBalance(upstream, acc.session, acc.proxy_url);
  if (result.ok) {
    db.prepare(
      `UPDATE accounts SET balance_remain=?, balance_updated_at=datetime('now','localtime') WHERE id=?`
    ).run(result.remain, acc.id);
    // 余额查询成功也算正常，记录日志
    db.prepare("INSERT INTO logs(account_id, ok, msg, created_at) VALUES(?,?,?,datetime('now','localtime'))")
      .run(acc.id, 1, `余额查询成功: $${result.remain.toFixed(2)}`);
    recordBalanceSnapshot();
  } else {
    db.prepare("INSERT INTO logs(account_id, ok, msg, created_at) VALUES(?,?,?,datetime('now','localtime'))")
      .run(acc.id, 0, `余额查询失败: ${result.msg}`);
  }
  res.json(result);
});

// ========== 统计 API ==========

app.get("/api/stats", (req, res) => {
  const accRow = db.prepare("SELECT COUNT(*) as cnt FROM accounts").get();
  const balRow = db.prepare(
    "SELECT COALESCE(SUM(balance_remain),0) as total FROM accounts WHERE balance_remain IS NOT NULL"
  ).get();
  const snapshots = db.prepare(`
    SELECT total_remain, account_count, created_at
    FROM balance_snapshots
    WHERE created_at > datetime('now','localtime','-7 days')
    ORDER BY id
  `).all();
  res.json({
    account_count: accRow.cnt,
    total_remain: Math.round(balRow.total * 100) / 100,
    snapshots,
  });
});

// ========== 日志 API（分页）==========

app.get("/api/logs", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = Math.min(Math.max(1, parseInt(req.query.per_page) || 10), 100);
  const total = db.prepare("SELECT COUNT(*) as cnt FROM logs").get().cnt;
  const offset = (page - 1) * perPage;
  const rows = db.prepare(
    `SELECT l.id, l.account_id, a.name as account_name, l.ok, l.msg, l.created_at
     FROM logs l LEFT JOIN accounts a ON a.id = l.account_id
     ORDER BY l.id DESC LIMIT ? OFFSET ?`
  ).all(perPage, offset);
  res.json({ rows, total, page, per_page: perPage });
});

app.delete("/api/logs", (req, res) => {
  db.prepare("DELETE FROM logs").run();
  res.json({ ok: true });
});

// ========== 设置 API ==========

app.get("/api/settings", (req, res) => {
  res.json(getAllSettings());
});

app.put("/api/settings", (req, res) => {
  const upsert = db.prepare(
    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) upsert.run(k, String(v));
  });
  tx(Object.entries(req.body));
  scheduleCron();
  res.json({ ok: true });
});

// ========== 签到执行 ==========

async function runCheckinAll() {
  const upstream = getSetting("upstream") || "https://anyrouter.top";
  const accounts = db.prepare("SELECT * FROM accounts WHERE enabled=1").all();
  if (accounts.length === 0) return;

  const results = [];
  for (const acc of accounts) {
    const { ok, msg } = await signIn(upstream, acc.session, acc.proxy_url);
    db.prepare("INSERT INTO logs(account_id, ok, msg, created_at) VALUES(?,?,?,datetime('now','localtime'))").run(acc.id, ok ? 1 : 0, msg);
    results.push(`${acc.name || "账号#" + acc.id}: ${ok ? "✅" : "❌"} ${msg}`);

    // 签到后自动查余额
    const bal = await queryBalance(upstream, acc.session, acc.proxy_url);
    if (bal.ok) {
      db.prepare(
        `UPDATE accounts SET balance_remain=?, balance_updated_at=datetime('now','localtime') WHERE id=?`
      ).run(bal.remain, acc.id);
      results.push(`  余额: $${bal.remain.toFixed(2)}`);
    }
  }

  recordBalanceSnapshot();

  const token = getSetting("tg_bot_token");
  const chatId = getSetting("tg_chat_id");
  if (token && chatId) {
    const text = `<b>AnyRouter 签到</b>\n${results.join("\n")}`;
    await sendTelegram(token, chatId, text);
  }
}

app.post("/api/checkin", async (req, res) => {
  try {
    await runCheckinAll();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/checkin/:id", async (req, res) => {
  const acc = db.prepare("SELECT * FROM accounts WHERE id=?").get(req.params.id);
  if (!acc) return res.status(404).json({ error: "账号不存在" });
  const upstream = getSetting("upstream") || "https://anyrouter.top";
  const { ok, msg } = await signIn(upstream, acc.session, acc.proxy_url);
  db.prepare("INSERT INTO logs(account_id, ok, msg, created_at) VALUES(?,?,?,datetime('now','localtime'))").run(acc.id, ok ? 1 : 0, msg);

  // 查余额
  const bal = await queryBalance(upstream, acc.session, acc.proxy_url);
  let balText = "";
  if (bal.ok) {
    db.prepare(
      `UPDATE accounts SET balance_remain=?, balance_updated_at=datetime('now','localtime') WHERE id=?`
    ).run(bal.remain, acc.id);
    balText = `\n余额: $${bal.remain.toFixed(2)}`;
    recordBalanceSnapshot();
  }

  // 发送 TG 通知
  const token = getSetting("tg_bot_token");
  const chatId = getSetting("tg_chat_id");
  if (token && chatId) {
    const name = acc.name || "账号#" + acc.id;
    const text = `<b>AnyRouter 签到</b>\n${name}: ${ok ? "✅" : "❌"} ${msg}${balText}`;
    await sendTelegram(token, chatId, text);
  }

  res.json({ ok, msg });
});

// ========== 定时任务 ==========

let cronTask = null;

function scheduleCron() {
  if (cronTask) { cronTask.stop(); cronTask = null; }
  const expr = getSetting("cron") || "0 9 * * *";
  if (!cron.validate(expr)) {
    console.error(`[cron] 无效表达式: ${expr}`);
    return;
  }
  cronTask = cron.schedule(expr, () => {
    console.log(`[cron] 触发签到 ${new Date().toISOString()}`);
    runCheckinAll().catch((e) => console.error("[cron] 签到异常:", e));
  }, { timezone: "Asia/Shanghai" });
  console.log(`[cron] 已设置定时: ${expr} (Asia/Shanghai)`);
}

// ========== 启动 ==========

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] 面板运行在 http://0.0.0.0:${PORT}`);
  scheduleCron();
});
