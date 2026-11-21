/**
 * GTW custom server: Next.js + WebSocket-прокси /ws -> gtw-адаптер Hermes gateway.
 *
 * Безопасность: апгрейд /ws допускается только с кукой gtw-auth (ставит /api/auth/login).
 * GTW_TOKEN подставляется сервером в заголовок X-GTW-Token апстрим-соединения —
 * браузер никогда не видит токен. Апстрим по умолчанию ws://127.0.0.1:8765/ws.
 *
 * Прокси также: подставляет login из куки в user_message (защита от спуфинга),
 * проверяет лимиты токенов (user_limits) и роль для админ-кадров
 * (sessions/models/set_model), накапливает usage_stats из кадров session_info.
 *
 * Env: PORT (3000), GTW_WS_URL, GTW_TOKEN, GTW_DATA_DIR, NODE_ENV.
 * Запуск: npm start  (NODE_ENV=production node server.js)
 */
const { createServer } = require("http");
const { createHmac, timingSafeEqual } = require("crypto");
const path = require("path");
const fs = require("fs");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");
const { DatabaseSync } = require("node:sqlite");

const dev = process.env.NODE_ENV === "development";
const port = parseInt(process.env.PORT || "3000", 10);
const GTW_WS_URL = process.env.GTW_WS_URL || "ws://127.0.0.1:8765/ws";
const GTW_TOKEN = process.env.GTW_TOKEN || "";
// Секрет подписи сессионной куки — тот же, что в src/lib/authToken.ts.
const AUTH_SECRET = process.env["GTW_AUTH_" + "SECRET"] || GTW_TOKEN || "gtw-dev-secret";
const MAX_PAYLOAD = 4 * 1024 * 1024; // как max_msg_size у адаптера

/* ── SQLite: лимиты и учёт токенов (та же БД, что у Next-роутов) ── */
const DATA_DIR = process.env.GTW_DATA_DIR || path.join(process.cwd(), "data");
let db = null;
function getDb() {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new DatabaseSync(path.join(DATA_DIR, "gtw.db"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_stats (
        chat_id    TEXT PRIMARY KEY,
        login      TEXT NOT NULL DEFAULT '',
        model      TEXT NOT NULL DEFAULT '',
        provider   TEXT NOT NULL DEFAULT '',
        tokens_in  INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        turns      INTEGER NOT NULL DEFAULT 0,
        tools      INTEGER NOT NULL DEFAULT 0,
        speed      REAL,
        source     TEXT NOT NULL DEFAULT 'unknown',
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_login ON usage_stats (login);
      CREATE TABLE IF NOT EXISTS user_limits (
        login       TEXT PRIMARY KEY,
        token_limit INTEGER,
        updated_at  TEXT NOT NULL
      );
    `);
  }
  return db;
}
function quotaFor(login) {
  try {
    const lim = getDb().prepare("SELECT token_limit FROM user_limits WHERE login = ?").get(login);
    const limit = lim && lim.token_limit > 0 ? lim.token_limit : null;
    if (limit === null) return { limit: null, used: 0 };
    const used = getDb()
      .prepare("SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS t FROM usage_stats WHERE login = ?")
      .get(login);
    return { limit, used: (used && used.t) || 0 };
  } catch (e) {
    console.error("[gtw-proxy] quota check failed:", e.message);
    return { limit: null, used: 0 }; // fail-open: сбой БД не блокирует чат
  }
}
function chatOwnerLogin(chatId) {
  if (chatOwners.has(chatId)) return chatOwners.get(chatId);
  try {
    const r = getDb().prepare("SELECT login FROM usage_stats WHERE chat_id = ?").get(chatId);
    return (r && r.login) || "";
  } catch {
    return "";
  }
}
function recordUsage(info) {
  try {
    const chatId = String(info.chat_id || "");
    if (!chatId) return;
    const login = chatOwners.get(chatId) || chatOwnerLogin(chatId) || String(info.user_id || "");
    const u = info.usage || {};
    getDb()
      .prepare(
        `INSERT INTO usage_stats (chat_id, login, model, provider, tokens_in, tokens_out, turns, tools, speed, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET
           login = CASE WHEN excluded.login != '' THEN excluded.login ELSE usage_stats.login END,
           model = CASE WHEN excluded.model != '' THEN excluded.model ELSE usage_stats.model END,
           provider = CASE WHEN excluded.provider != '' THEN excluded.provider ELSE usage_stats.provider END,
           tokens_in = excluded.tokens_in, tokens_out = excluded.tokens_out,
           turns = excluded.turns, tools = excluded.tools,
           speed = excluded.speed, source = excluded.source, updated_at = excluded.updated_at`
      )
      .run(
        chatId, login, String(info.model || ""), String(info.provider || ""),
        Math.max(0, Math.round(u.inTokens || 0)), Math.max(0, Math.round(u.outTokens || 0)),
        Math.max(0, Math.round(info.turns || 0)), Math.max(0, Math.round((info.tools && info.tools.count) || 0)),
        (info.speed && info.speed.tokensPerSec) || null, String(info.source || "unknown"),
        new Date().toISOString()
      );
  } catch (e) {
    console.error("[gtw-proxy] usage record failed:", e.message);
  }
}
const chatOwners = new Map(); // chat_id -> login (из user_message этой сессии)

/** Проверка куки gtw-auth: формат v1.<b64url(payload)>.<b64url(HMAC-SHA256)>, срок не истёк. */
function parseSessionCookie(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  try {
    const sig = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const expect = createHmac("sha256", AUTH_SECRET).update(`v1.${parts[1]}`).digest();
    if (sig.length !== expect.length || !timingSafeEqual(sig, expect)) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

const app = next({ dev });
const handle = app.getRequestHandler();

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return out;
}

function rejectUpgrade(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  server.on("upgrade", (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws") {
      // прочие апгрейды (HMR в dev) не трогаем
      if (dev) return;
      socket.destroy();
      return;
    }
    const cookies = parseCookies(req.headers.cookie);
    const session = parseSessionCookie(cookies["gtw-auth"]);
    if (!session || !session.login) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }
    if (!GTW_TOKEN) {
      console.error("[gtw-proxy] GTW_TOKEN не задан — проксирование невозможно");
      rejectUpgrade(socket, 503, "GTW token not configured");
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      pipeToAdapter(client, session);
    });
  });

  function pipeToAdapter(client, session) {
    const login = String(session.login);
    const isAdmin = session.role === "admin";
    const upstream = new WebSocket(GTW_WS_URL, {
      headers: { "X-GTW-Token": GTW_TOKEN },
      maxPayload: MAX_PAYLOAD,
      handshakeTimeout: 10000,
    });
    const pending = []; // кадры браузера до открытия апстрима ({data, isBinary})
    let opened = false;
    let closed = false;

    const closeBoth = (code, reason) => {
      if (closed) return;
      closed = true;
      clearInterval(keepalive);
      try { client.close(code, reason); } catch {}
      try { upstream.close(); } catch {}
    };

    const sendToClient = (obj) => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(JSON.stringify(obj)); } catch {}
      }
    };

    upstream.on("open", () => {
      opened = true;
      for (const { data, isBinary } of pending) {
        try { upstream.send(data, { binary: isBinary }); } catch {}
      }
      pending.length = 0;
    });
    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(data, { binary: isBinary }); } catch {}
      }
      // учёт токенов: сниффим только кадры session_info (дёшево по префиксу)
      if (!isBinary && data.length < 256 * 1024) {
        const head = data.slice(0, 40).toString("utf8");
        if (head.includes('"session_info"')) {
          try {
            const frame = JSON.parse(data.toString("utf8"));
            if (frame.type === "session_info" && frame.info) recordUsage(frame.info);
          } catch {}
        }
      }
    });
    upstream.on("close", (code, reason) => {
      closeBoth(code >= 1000 && code <= 4999 ? code : 1001, reason?.toString().slice(0, 120));
    });
    upstream.on("error", (err) => {
      console.error("[gtw-proxy] upstream error:", err.message);
      closeBoth(1011, "upstream error");
    });

    /** Гейтинг клиентских кадров: роль, владелец чата, лимит токенов.
     *  Возвращает строку для отправки апстриму или null (кадр заблокирован). */
    function gateClientFrame(raw) {
      let frame;
      try { frame = JSON.parse(raw); } catch { return null; }
      const type = frame && frame.type;
      if (type === "user_message") {
        const chatId = String(frame.chat_id || "main");
        chatOwners.set(chatId, login);
        const { limit, used } = quotaFor(login);
        if (limit !== null && used >= limit) {
          sendToClient({ type: "error", error: "quota_exceeded", limit, used });
          return null;
        }
        // login из подписанной куки, не из клиента (защита от спуфинга)
        frame.user_id = login;
        frame.user_name = login;
        return JSON.stringify(frame);
      }
      if (type === "sessions" || type === "models" || type === "set_model") {
        if (!isAdmin) {
          sendToClient({ type: "error", error: "forbidden" });
          return null;
        }
        return raw;
      }
      if (type === "session_info") {
        const chatId = String(frame.chat_id || "main");
        const owner = chatOwnerLogin(chatId);
        if (!isAdmin && owner && owner !== login) {
          sendToClient({ type: "error", error: "forbidden" });
          return null;
        }
        if (owner) chatOwners.set(chatId, owner);
        return raw;
      }
      return raw;
    }

    client.on("message", (data, isBinary) => {
      if (isBinary) return; // протокол JSON-текстовый
      const out = gateClientFrame(data.toString("utf8"));
      if (out === null) return;
      // важно: слать ТЕКСТОВЫМ фреймом — адаптер читает только WSMsgType.TEXT
      if (opened && upstream.readyState === WebSocket.OPEN) {
        try { upstream.send(out, { binary: false }); } catch {}
      } else if (!closed && pending.length < 100) {
        pending.push({ data: out, isBinary: false });
      }
    });
    client.on("close", (code, reason) => {
      closeBoth(code >= 1000 && code <= 4999 ? code : 1000, reason?.toString().slice(0, 120));
    });
    client.on("error", () => closeBoth(1011, "client error"));

    // keepalive: пингуем браузер, чтобы промежуточные прокси не рвали idle-соединение
    let alive = true;
    client.on("pong", () => { alive = true; });
    const keepalive = setInterval(() => {
      if (closed) return clearInterval(keepalive);
      if (!alive) return closeBoth(1001, "keepalive timeout");
      alive = false;
      try { client.ping(); } catch {}
    }, 30000);
  }

  server.listen(port, () => {
    console.log(`[gtw] Next.js (${dev ? "dev" : "production"}) на :${port}`);
    console.log(`[gtw] WS-прокси /ws -> ${GTW_WS_URL} (токен: ${GTW_TOKEN ? "задан" : "НЕ ЗАДАН"})`);
  });
});