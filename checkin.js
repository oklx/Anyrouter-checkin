/**
 * AnyRouter 签到核心逻辑
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";

const XOR_KEY = "3000176000856006061501533003690027800375";
const UNSBOX_TABLE = [
  0xf, 0x23, 0x1d, 0x18, 0x21, 0x10, 0x1, 0x26, 0xa, 0x9, 0x13, 0x1f, 0x28,
  0x1b, 0x16, 0x17, 0x19, 0xd, 0x6, 0xb, 0x27, 0x12, 0x14, 0x8, 0xe, 0x15,
  0x20, 0x1a, 0x2, 0x1e, 0x7, 0x4, 0x11, 0x5, 0x3, 0x1c, 0x22, 0x25,
  0xc, 0x24,
];

function computeAcwCookie(arg1) {
  const unsboxed = UNSBOX_TABLE.map((i) => arg1[i - 1]).join("");
  let out = "";
  for (let i = 0; i < 40; i += 2) {
    const a = parseInt(unsboxed.slice(i, i + 2), 16);
    const b = parseInt(XOR_KEY.slice(i, i + 2), 16);
    out += (a ^ b).toString(16).padStart(2, "0");
  }
  return `acw_sc__v2=${out}`;
}

/**
 * 代理 fetch：当 proxyUrl 存在时，通过代理服务转发请求
 */
async function proxyFetch(url, opts = {}, proxyUrl) {
  if (!proxyUrl) {
    return fetch(url, opts);
  }
  const proxyBody = {
    url: typeof url === "string" ? url : url.toString(),
    method: opts.method || "GET",
    headers: opts.headers || {},
    body: opts.body ?? "",
  };
  const resp = await fetch(`${proxyUrl.replace(/\/+$/, "")}/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proxyBody),
  });
  const data = await resp.json();
  // 构造一个类 Response 对象
  return {
    status: data.status,
    ok: data.status >= 200 && data.status < 300,
    headers: new Headers(data.headers || {}),
    text: async () => data.body,
    json: async () => JSON.parse(data.body),
  };
}

async function getAcwCookie(targetUrl, proxyUrl) {
  try {
    const resp = await proxyFetch(targetUrl.toString(), {
      method: "GET",
      headers: { "User-Agent": UA },
      redirect: "manual",
    }, proxyUrl);
    const html = await resp.text();
    const m = html.match(/var\s+arg1\s*=\s*'([0-9a-fA-F]{40})'/);
    if (!m) return null;
    return computeAcwCookie(m[1]);
  } catch {
    return null;
  }
}

/**
 * 对单个账号执行签到
 * @param {string} upstream - 上游地址
 * @param {string} session - session cookie 值
 * @param {string} [proxyUrl] - 代理地址
 * @returns {{ ok: boolean, msg: string }}
 */
export async function signIn(upstream, session, proxyUrl) {
  const signUrl = new URL("/api/user/sign_in", upstream);
  const candidates = [signUrl, new URL("/api/user/self", upstream)];

  let acwCookie = null;
  for (const apiUrl of candidates) {
    const targetUrl = new URL(apiUrl.pathname + apiUrl.search, upstream);
    acwCookie = await getAcwCookie(targetUrl, proxyUrl);
    if (acwCookie) break;
  }

  if (!acwCookie) {
    return { ok: false, msg: "获取动态 Cookie 失败" };
  }

  let resp;
  try {
    resp = await proxyFetch(signUrl.toString(), {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Cookie: `${acwCookie}; session=${session}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        Origin: upstream,
        Referer: `${upstream}/`,
      },
      body: "",
    }, proxyUrl);
  } catch (err) {
    return { ok: false, msg: `请求异常: ${String(err)}` };
  }

  if (resp.status === 401) return { ok: false, msg: "session 无效(401)" };

  const bodyText = await resp.text().catch(() => "");
  if (!resp.ok) return { ok: false, msg: `HTTP ${resp.status}: ${bodyText}` };

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return { ok: false, msg: `响应非JSON: ${bodyText}` };
  }

  if (data?.success === true) {
    return { ok: true, msg: data.message || "签到成功" };
  }
  if (data?.success === false) {
    return { ok: false, msg: data.message || JSON.stringify(data) };
  }
  return { ok: true, msg: `返回: ${JSON.stringify(data)}` };
}

/**
 * 发送 Telegram 通知
 */
export async function sendTelegram(token, chatId, messageHtml) {
  if (!token || !chatId) return { sent: false, reason: "未配置" };
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: messageHtml, parse_mode: "HTML" }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { sent: false, reason: `HTTP ${resp.status}: ${text}` };
  }
  return { sent: true };
}

/**
 * 从 session cookie 中提取 New-API 的 user ID
 * session 格式：base64( timestamp | base64(gob数据) | 签名 )
 * gob 中 "id" 字段后的字节序列：\x02id\x03int\x04\x05\x00\xfd + 3字节大端序(zigzag编码)
 */
function extractUserIdFromSession(session) {
  try {
    const outer = Buffer.from(session, "base64").toString("latin1");
    const parts = outer.split("|");
    if (parts.length < 2) return null;
    const inner = Buffer.from(parts[1], "base64");
    // 搜索 \x02id\x03int 标记
    for (let i = 0; i < inner.length - 6; i++) {
      if (inner[i] === 0x02 && inner[i+1] === 0x69 && inner[i+2] === 0x64 &&
          inner[i+3] === 0x03 && inner[i+4] === 0x69 && inner[i+5] === 0x6e && inner[i+6] === 0x74) {
        // 跳过 \x04\x05\x00，找 \xfd 标记
        for (let j = i + 7; j < i + 15 && j + 3 < inner.length; j++) {
          if (inner[j] === 0xfd) {
            const raw = (inner[j+1] << 16) | (inner[j+2] << 8) | inner[j+3];
            const userId = raw >> 1; // zigzag 解码
            if (userId > 0 && userId < 100000000) return String(userId);
          }
        }
      }
    }
  } catch {}
  return null;
}

/**
 * 查询账号余额
 * @param {string} upstream - 上游地址
 * @param {string} session - session cookie 值
 * @param {string} [proxyUrl] - 代理地址
 */
export async function queryBalance(upstream, session, proxyUrl) {
  const selfUrl = new URL("/api/user/self", upstream);

  // 获取 acw cookie
  const acwCookie = await getAcwCookie(selfUrl, proxyUrl);
  if (!acwCookie) {
    return { ok: false, msg: "获取动态 Cookie 失败" };
  }

  // 从 session 中提取 user ID
  const userId = extractUserIdFromSession(session);
  if (!userId) {
    return { ok: false, msg: "无法从 session 中提取用户 ID" };
  }

  const headers = {
    "User-Agent": UA,
    Cookie: `${acwCookie}; session=${session}`,
    Accept: "application/json, text/plain, */*",
    Origin: upstream,
    Referer: `${upstream}/console/topup`,
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "new-api-user": userId,
  };

  let data;
  try {
    const resp = await proxyFetch(selfUrl.toString(), { method: "GET", headers }, proxyUrl);
    const text = await resp.text().catch(() => "");
    if (!resp.ok) return { ok: false, msg: `HTTP ${resp.status}: ${text}` };
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, msg: `请求异常: ${String(err)}` };
  }

  if (!data?.success || !data?.data) {
    return { ok: false, msg: data?.message || JSON.stringify(data) };
  }

  const user = data.data;
  const QUOTA_PER_DOLLAR = 500000;
  const remain = (user.quota ?? 0) / QUOTA_PER_DOLLAR;

  return {
    ok: true,
    remain,
    userId,
  };
}
