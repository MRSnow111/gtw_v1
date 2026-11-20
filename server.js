/**
 * GTW custom server: Next.js + WebSocket-прокси /ws -> gtw-адаптер Hermes gateway.
 *
 * Безопасность: апгрейд /ws допускается только с кукой gtw-auth (ставит /api/auth/login).
 * GTW_TOKEN подставляется сервером в заголовок X-GTW-Token апстрим-соединения —
 * браузер никогда не видит токен. Апстрим по умолчанию ws://127.0.0.1:8765/ws.
 *
 * Env: PORT (3000), GTW_WS_URL, GTW_TOKEN, NODE_ENV.
 * Запуск: npm start  (NODE_ENV=production node server.js)
 */
const { createServer } = require("http");
const { createHmac, timingSafeEqual } = require("crypto");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");

const dev = process.env.NODE_ENV === "development";
const port = parseInt(process.env.PORT || "3000", 10);
const GTW_WS_URL = process.env.GTW_WS_URL || "ws://127.0.0.1:8765/ws";
const GTW_TOKEN = process.env.GTW_TOKEN || "";
// Секрет подписи сессионной куки — тот же, что в src/lib/authToken.ts.
const AUTH_SECRET = process.env["GTW_AUTH_" + "SECRET"] || GTW_TOKEN || "gtw-dev-secret";
const MAX_PAYLOAD = 4 * 1024 * 1024; // как max_msg_size у адаптера

/** Проверка куки gtw-auth: формат v1.<b64url(payload)>.<b64url(HMAC-SHA256)>, срок не истёк. */
function verifySessionCookie(token) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  try {
    const sig = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const expect = createHmac("sha256", AUTH_SECRET).update(`v1.${parts[1]}`).digest();
    if (sig.length !== expect.length || !timingSafeEqual(sig, expect)) return false;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    return typeof payload.exp === "number" && payload.exp >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
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
    if (!verifySessionCookie(cookies["gtw-auth"])) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }
    if (!GTW_TOKEN) {
      console.error("[gtw-proxy] GTW_TOKEN не задан — проксирование невозможно");
      rejectUpgrade(socket, 503, "GTW token not configured");
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => {
      pipeToAdapter(client);
    });
  });

  function pipeToAdapter(client) {
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
    });
    upstream.on("close", (code, reason) => {
      closeBoth(code >= 1000 && code <= 4999 ? code : 1001, reason?.toString().slice(0, 120));
    });
    upstream.on("error", (err) => {
      console.error("[gtw-proxy] upstream error:", err.message);
      closeBoth(1011, "upstream error");
    });

    client.on("message", (data, isBinary) => {
      if (isBinary) return; // протокол JSON-текстовый
      // важно: слать ТЕКСТОВЫМ фреймом — адаптер читает только WSMsgType.TEXT
      if (opened && upstream.readyState === WebSocket.OPEN) {
        try { upstream.send(data, { binary: false }); } catch {}
      } else if (!closed && pending.length < 100) {
        pending.push({ data, isBinary: false });
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