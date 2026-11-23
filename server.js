/**
 * GTW custom server: Next.js + WebSocket-прокси /ws -> gtw-адаптер Hermes gateway.
 *
 * Безопасность: апгрейд /ws допускается только с кукой gtw-auth (ставит /api/auth/login).
 * GTW_TOKEN подставляется сервером в заголовок X-GTW-Token апстрим-соединения —
 * браузер никогда не видит токен. Апстрим по умолчанию ws://127.0.0.1:8765/ws.
 *
 * Прокси также: подставляет login из куки в user_message (защита от спуфинга),
 * проверяет лимиты токенов (user_limits), белый список моделей (user_models)
 * и роль для админ-кадров (sessions), накапливает usage_stats из session_info.
 *
 * Env: PORT (3000), GTW_WS_URL, GTW_TOKEN, GTW_DATA_DIR, NODE_ENV.
 * Запуск: npm start  (NODE_ENV=production node server.js)
 */
const { createServer } = require("http");
const { createHmac, timingSafeEqual, randomUUID } = require("crypto");
const os = require("os");
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
      CREATE TABLE IF NOT EXISTS user_models (
        login      TEXT PRIMARY KEY,
        models     TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS files (
        id           TEXT PRIMARY KEY,
        login        TEXT NOT NULL,
        chat_id      TEXT NOT NULL DEFAULT '',
        direction    TEXT NOT NULL CHECK (direction IN ('in', 'out')),
        name         TEXT NOT NULL,
        mime         TEXT NOT NULL DEFAULT 'application/octet-stream',
        size         INTEGER NOT NULL DEFAULT 0,
        storage_path TEXT NOT NULL,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_files_login ON files (login, created_at);
      CREATE INDEX IF NOT EXISTS idx_files_chat ON files (chat_id);
      CREATE TABLE IF NOT EXISTS chats (
        login      TEXT NOT NULL,
        chat_id    TEXT NOT NULL,
        title      TEXT NOT NULL DEFAULT 'Новый чат',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (login, chat_id)
      );
      CREATE INDEX IF NOT EXISTS idx_chats_login ON chats (login, updated_at);
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
/** Логин, блокирующий доступ к session_info, либо "" если доступ разрешён.
 *  Приоритет: per-login реестр chats (авторитетно) → для незарегистрированных
 *  старых чатов fallback на usage_stats. Общий дефолт "main" НЕ гейтится:
 *  он не зарегистрирован и не является частным чатом (иначе ложный forbidden
 *  у всех, кроме того, на кого usage_stats случайно записал "main"). */
function sessionInfoBlockOwner(chatId, login) {
  try {
    // мой зарегистрированный чат → разрешён
    const mine = getDb().prepare("SELECT 1 FROM chats WHERE chat_id = ? AND login = ?").get(chatId, login);
    if (mine) return "";
    // зарегистрирован на другого → чужой
    const reg = getDb().prepare("SELECT login FROM chats WHERE chat_id = ?").get(chatId);
    if (reg && reg.login) return reg.login;
    // общий дефолт "main" без регистрации → не частный чат, разрешён
    if (chatId === "main") return "";
    // старый незарегистрированный чат → владелец из usage_stats
    const u = getDb().prepare("SELECT login FROM usage_stats WHERE chat_id = ?").get(chatId);
    return (u && u.login) || "";
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
const chatModels = new Map(); // chat_id -> "provider/model" (текущая модель из кадров шлюза)

/* ── Файлы: стор + реестр (тот же layout, что src/lib/fileStore.ts) ── */
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 МБ на файл (MVP)
const FILESTORE_ROOT = process.env.GTW_FILESTORE_DIR || path.join(DATA_DIR, "filestore");
const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
// доп. корни-источники артефактов (для бенча/тестов; на бою хватает HERMES_HOME)
const ARTIFACT_EXTRA_ROOTS = (process.env.GTW_ARTIFACT_ROOTS || "").split(":").filter(Boolean);

function sanitizeLoginJs(login) {
  return String(login || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "user";
}
function sanitizeNameJs(name) {
  let base = String(name || "").split(/[\\/]/).pop() || "file";
  base = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[<>:"|?*]/g, "_").trim().replace(/^\.+/, "").slice(0, 120);
  if (!base || base === "." || base === "..") base = "file";
  return base;
}
/** Путь-источник артефакта должен лежать под доверенным корнем (anti-traversal). */
function artifactSourceAllowed(p) {
  const abs = path.resolve(String(p || ""));
  const roots = [HERMES_HOME, FILESTORE_ROOT, ...ARTIFACT_EXTRA_ROOTS].map((r) => path.resolve(r));
  return roots.some((r) => abs === r || abs.startsWith(r + path.sep));
}
/** Скопировать артефакт агента в стор + реестр (direction=out), вернуть метаданные. */
function registerArtifact(login, chatId, srcPath, name, mime) {
  const id = randomUUID();
  const safe = sanitizeNameJs(name || path.basename(srcPath));
  const dir = path.join(FILESTORE_ROOT, sanitizeLoginJs(login), id);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, safe);
  fs.copyFileSync(srcPath, dest);
  const size = fs.statSync(dest).size;
  const finalMime = mime || "application/octet-stream";
  getDb()
    .prepare(
      `INSERT INTO files (id, login, chat_id, direction, name, mime, size, storage_path, created_at)
       VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`
    )
    .run(id, login, chatId, safe, finalMime, size, dest, new Date().toISOString());
  return { id, url: `/api/files/${id}`, name: safe, mime: finalMime, size };
}
/** Резолв вложений пользователя: только свои файлы (direction=in), с путём в сторе. */
function resolveAttachments(login, isAdmin, attachments) {
  const out = [];
  if (!Array.isArray(attachments)) return out;
  for (const att of attachments.slice(0, 10)) {
    const fileId = String((att && att.fileId) || "");
    if (!fileId) continue;
    try {
      const row = getDb().prepare("SELECT * FROM files WHERE id = ?").get(fileId);
      if (!row || row.direction !== "in") continue;
      if (!isAdmin && row.login !== login) continue;
      if (!row.storage_path || !fs.existsSync(row.storage_path)) continue;
      out.push({ fileId: row.id, name: row.name, mime: row.mime, size: row.size, storage_path: row.storage_path });
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Белый список моделей логина (user_models): null = все разрешены. fail-open при сбое БД. */
function allowlistFor(login) {
  try {
    const r = getDb().prepare("SELECT models FROM user_models WHERE login = ?").get(login);
    if (!r) return null;
    const arr = JSON.parse(r.models);
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch (e) {
    console.error("[gtw-proxy] allowlist check failed:", e.message);
    return null;
  }
}
/** Карта slug→display имён провайдеров из каталога (кадр models, поле slug).
 *  session_info/models.current несут slug (alibaba-token-plan, custom:selectel_router_api),
 *  а каталог и белый список — display («Alibaba Cloud (Token Plan)», Selectel_Router_api).
 *  Без нормализации гейт сравнивает разные формы и блокирует РАЗРЕШЁННУЮ модель
 *  (model_forbidden reason:current сразу после переключения). */
const providerSlugToDisplay = new Map();
function learnProviders(providers) {
  for (const p of providers || []) {
    const slug = String((p && p.slug) || "");
    const name = String((p && p.name) || "");
    if (slug && name) providerSlugToDisplay.set(slug, name);
  }
}
/** «provider/model» -> display-форма провайдера (первый «/» отделяет провайдера;
 *  id модели может быть роутерным «anthropic/claude-...»). Голый model — без изменений. */
function normModelKey(key) {
  const t = String(key || "").trim();
  const i = t.indexOf("/");
  if (i <= 0) return t;
  const prov = t.slice(0, i);
  return (providerSlugToDisplay.get(prov) || prov) + "/" + t.slice(i + 1);
}
/** Разрешена ли модель: "provider/model" или голый "model" (матч по суффиксу).
 *  Обе стороны нормализуются к display-форме провайдера. */
function modelAllowed(allow, target) {
  if (!allow || !allow.length) return true;
  const t = normModelKey(target);
  if (!t) return false;
  const norm = allow.map((a) => normModelKey(a));
  if (norm.includes(t)) return true;
  if (!t.includes("/")) return norm.some((a) => a.endsWith("/" + t));
  return false;
}

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
    let bootModels = true; // первый кадр models — bootstrap-каталог для карты slug→display

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

    // Индикатор лимита/расхода токенов в чате: агрегат по логину.
    // used считаем всегда (даже без лимита), limit — из user_limits (null = без лимита).
    const sendQuota = () => {
      const { limit } = quotaFor(login);
      let used = 0;
      try {
        const r = getDb()
          .prepare("SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS t FROM usage_stats WHERE login = ?")
          .get(login);
        used = (r && r.t) || 0;
      } catch {}
      sendToClient({ type: "quota", login, limit, used });
    };
    sendQuota(); // стартовый снимок сразу при подключении

    upstream.on("open", () => {
      opened = true;
      // B1: наполняем карту slug→display ДО первого session_info (иначе новый чат
      // restricted-юзера получает chatModels в slug-форме и гейт блокирует РАЗРЕШЁННУЮ
      // модель). Служебный bootstrap-кадр в браузер не форвардим (флаг bootModels).
      try { upstream.send(JSON.stringify({ type: "models", chat_id: "main", user_id: login, user_name: login }), { binary: false }); } catch {}
      for (const { data, isBinary } of pending) {
        try { upstream.send(data, { binary: isBinary }); } catch {}
      }
      pending.length = 0;
    });
    upstream.on("message", (data, isBinary) => {
      let outData = data;
      // сниффим служебные кадры: учёт токенов, текущая модель, фильтр каталога
      if (!isBinary && data.length < 256 * 1024) {
        const head = data.slice(0, 48).toString("utf8");
        if (head.includes('"session_info"') || head.includes('"models"') || head.includes('"set_model_ack"') || head.includes('"artifact"')) {
          try {
            const frame = JSON.parse(data.toString("utf8"));
            if (frame.type === "session_info" && frame.info) {
              recordUsage(frame.info);
              const inf = frame.info;
              if (inf.provider && inf.model) chatModels.set(String(inf.chat_id), normModelKey(`${inf.provider}/${inf.model}`));
              sendQuota(); // обновляем индикатор лимита после учёта токенов
            } else if (frame.type === "models") {
              learnProviders(frame.providers); // карта slug→display для гейта/пикера
              // bootstrap-каталог (запрос при open): только наполняем карту, в браузер не шлём
              if (bootModels) { bootModels = false; return; }
              const cur = frame.current;
              if (cur && cur.provider && cur.model) {
                // current к display: пикер подсвечивает текущую модель (ключи каталога —
                // display), гейт хранит chatModels в той же форме.
                cur.provider = providerSlugToDisplay.get(cur.provider) || cur.provider;
                chatModels.set(String(frame.chat_id), `${cur.provider}/${cur.model}`);
                outData = Buffer.from(JSON.stringify(frame), "utf8");
              }
              if (!isAdmin) {
                const allow = allowlistFor(login);
                if (allow) {
                  frame.providers = (frame.providers || [])
                    .map((p) => ({ ...p, models: (p.models || []).filter((m) => modelAllowed(allow, `${p.name}/${m}`)) }))
                    .filter((p) => p.models && p.models.length);
                  frame.restricted = true;
                  outData = Buffer.from(JSON.stringify(frame), "utf8");
                }
              }
            } else if (frame.type === "set_model_ack" && frame.ok) {
              const mdl = normModelKey(String(frame.model || ""));
              if (mdl.includes("/")) chatModels.set(String(frame.chat_id), mdl);
            } else if (frame.type === "artifact") {
              // артефакт агента: url — host-путь файла. Копируем в стор + реестр,
              // подменяем url на /api/files/<id> (браузер не видит сырой путь).
              const chatId = String(frame.chat_id || "");
              const src = String(frame.url || "");
              if (src && !src.startsWith("/api/files/")) {
                try {
                  const st = fs.existsSync(src) ? fs.statSync(src) : null;
                  if (st && st.isFile() && st.size <= MAX_FILE_SIZE && artifactSourceAllowed(src)) {
                    const reg = registerArtifact(login, chatId, src, frame.name, frame.mime);
                    frame.url = reg.url;
                    frame.fileId = reg.id;
                    frame.name = reg.name;
                    frame.mime = reg.mime;
                    frame.size = reg.size;
                    outData = Buffer.from(JSON.stringify(frame), "utf8");
                  }
                } catch (e) {
                  console.error("[gtw-proxy] artifact register failed:", e.message);
                }
              }
            }
          } catch {}
        }
      }
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(outData, { binary: isBinary }); } catch {}
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
        if (!isAdmin) {
          const allow = allowlistFor(login);
          const cmd = String(frame.text || "").trim().match(/^\/model(?:@[\w-]+)?\s+(.+)$/i);
          if (cmd) {
            // /model в тексте чата — обход пикера; гейтим по белому списку
            const target = cmd[1].trim();
            if (!modelAllowed(allow, target)) {
              sendToClient({ type: "error", error: "model_forbidden", model: target });
              return null;
            }
          } else {
            // Текущая модель чата должна быть разрешена. Если она НЕ в белом списке
            // (напр. дефолт профиля qwen3.8-flash у ограниченного пользователя) или
            // ещё не выбрана — авто-выбираем первую разрешённую и шлём set_model ДО
            // user_message (тем же путём/очередью), чтобы ход сразу шёл на доступной
            // модели. Раньше не-разрешённая текущая модель блокировала чат ошибкой
            // model_forbidden reason:current, а авто-выбор срабатывал только при пустой
            // модели — чат «переставал работать», пока пользователь не откроет пикер.
            const cur = chatModels.get(chatId);
            const curOk = !!cur && modelAllowed(allow, cur);
            if (!curOk && allow && allow.length) {
              const target = allow[0];
              chatModels.set(chatId, target);
              const sm = JSON.stringify({ type: "set_model", chat_id: chatId, model: target, user_id: login, user_name: login });
              if (opened && upstream.readyState === WebSocket.OPEN) {
                try { upstream.send(sm, { binary: false }); } catch {}
              } else if (!closed && pending.length < 100) {
                pending.push({ data: sm, isBinary: false });
              }
            }
          }
        }
        // login из подписанной куки, не из клиента (защита от спуфинга)
        frame.user_id = login;
        frame.user_name = login;
        frame.role = isAdmin ? "admin" : "user"; // админ не изолируется по профилю
        // вложения: только свои файлы (direction=in), адаптеру отдаём storage_path
        if (Array.isArray(frame.attachments) && frame.attachments.length) {
          frame.attachments = resolveAttachments(login, isAdmin, frame.attachments);
        } else {
          delete frame.attachments;
        }
        return JSON.stringify(frame);
      }
      if (type === "sessions") {
        if (!isAdmin) {
          sendToClient({ type: "error", error: "forbidden" });
          return null;
        }
        return raw;
      }
      if (type === "models") {
        // каталог доступен всем; для не-админа ответ фильтруется по белому списку
        return raw;
      }
      if (type === "set_model") {
        if (!isAdmin && !modelAllowed(allowlistFor(login), String(frame.model || ""))) {
          sendToClient({ type: "error", error: "model_forbidden", model: String(frame.model || "") });
          return null;
        }
        // login из куки — чтобы /model применился к ТОЙ ЖЕ сессии, что и user_message
        // (иначе override уходит в сессию "gtw", а ходы идут в сессии login -> модель откатывается)
        const parsed = JSON.parse(raw);
        parsed.user_id = login;
        parsed.user_name = login;
        return JSON.stringify(parsed);
      }
      if (type === "session_info") {
        const chatId = String(frame.chat_id || "main");
        // Реестр chats авторитетен; старые незарегистрированные чаты — по
        // usage_stats; общий дефолт "main" не гейтится (ложный forbidden).
        const block = sessionInfoBlockOwner(chatId, login);
        if (!isAdmin && block && block !== login) {
          sendToClient({ type: "error", error: "forbidden" });
          return null;
        }
        const owner = chatOwnerLogin(chatId);
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