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
 * Волна 1 (W1): апгрейд /ws дополнительно сверяет куку с ЖИВОЙ учёткой (S4 —
 * удалённый/разжалованный юзер получает close 4401, кука не «переживает» аккаунт)
 * и с Origin-хостом запроса (S5 — защита от CSWSH); host-пути из БД (storage_path)
 * проверяются на принадлежность стору перед отдачей адаптеру (S7); в production
 * запуск без явного секрета подписи куки прерывается сразу (S11).
 *
 * Env: PORT (3000), GTW_WS_URL, GTW_TOKEN, GTW_DATA_DIR, NODE_ENV,
 *      GTW_LOGIN / GTW_USER_LOGIN (учётки из env — для сверки куки S4).
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

/* W1-S11-START ── S11: fail-fast на дефолтном секрете подписи куки ──────────
 * AUTH_SECRET ниже допускается три источниками: GTW_AUTH_SECRET, GTW_TOKEN и
 * захардкоженный dev-дефолт. Последние два в production означают, что куки
 * подписаны значением, известным из исходников, — любой, кто прочитал репозиторий
 * или видел дефолтный env, может подделать куку role=admin и войти в WS-прокси
 * (и в админ-роуты Next, где тот же секрет). Поэтому в production без ЯВНОГО
 * секрета сервер не стартует вовсе; в dev дефолт остаётся для локальной разработки. */
if (!dev && !(process.env["GTW_AUTH_" + "SECRET"] || process.env["GTW_" + "TOKEN"])) {
  console.error(
    "[gtw] FATAL: NODE_ENV=production требует явного секрета подписи куки: " +
      "GTW_AUTH_" + "SECRET (или хотя бы GTW_" + "TOKEN). Дефолт из исходников " +
      "позволяет подделать сессионную куку (в т.ч. admin). Запуск прерван."
  );
  process.exit(1);
}
/* W1-S11-END */

/* ── SQLite: лимиты и учёт токенов (та же БД, что у Next-роутов) ── */
const DATA_DIR = process.env.GTW_DATA_DIR || path.join(process.cwd(), "data");
// Волна 5 (K1): схема/миграции/общие запросы — в едином модуле gtwDb.mjs
// (та же копия используется src/lib/db.ts). busy_timeout=5000 против SQLITE_BUSY.
const gtwDb = require("./src/lib/gtwDb.mjs");
let db = null;
function getDb() {
  if (!db) db = gtwDb.openGtwDb(DATA_DIR);
  return db;
}
/** Расход логина с учётом offset сброса: used = MAX(0, SUM(tokens) - usage_offset). */
function usedFor(login) {
  return gtwDb.usedForLogin(getDb(), login);
}
function quotaFor(login) {
  try {
    return { limit: gtwDb.limitForLogin(getDb(), login), used: usedFor(login) };
  } catch (e) {
    console.error("[gtw-proxy] quota check failed:", e.message);
    return { limit: null, used: 0 }; // fail-open: сбой БД не блокирует чат
  }
}

/* ── Сброс расхода токенов (ручной из админ-API и авто по расписанию) ── */
// Реестр живых WS-клиентов, чтобы пушить свежую quota после авто-сброса.
const liveClients = new Set(); // { login, sendQuota }

/** Обнулить used логина через offset = текущая сумма; снапшоты не трогаем. */
function resetUsageFor(login) {
  const total = gtwDb.resetUsageOffset(getDb(), login);
  for (const c of liveClients) {
    if (c.login === login) { try { c.sendQuota(); } catch {} }
  }
  return total;
}

/** Ближайший авто-сброс строго после from (UTC). Зеркало usageStore.computeNextReset. */
function computeNextReset(mode, hour, day, from) {
  const ms = gtwDb.computeNextResetMs(mode, hour, day, from.getTime());
  return ms === null ? null : new Date(ms);
}

/** Планировщик: обнуляем расход тем, у кого next_reset_at уже наступил. */
function runAutoResets() {
  try {
    const now = new Date();
    const rows = getDb()
      .prepare("SELECT login, reset_mode, reset_hour, reset_day, next_reset_at FROM user_limits WHERE reset_mode != 'off' AND next_reset_at IS NOT NULL")
      .all();
    for (const r of rows) {
      if (!r.next_reset_at || new Date(r.next_reset_at) > now) continue;
      resetUsageFor(r.login);
      const next = computeNextReset(r.reset_mode, r.reset_hour, r.reset_day, now);
      const nowIso = now.toISOString();
      getDb()
        .prepare("UPDATE user_limits SET next_reset_at = ?, last_reset_at = ?, updated_at = ? WHERE login = ?")
        .run(next ? next.toISOString() : null, nowIso, nowIso, r.login);
      console.log(`[gtw-proxy] авто-сброс расхода: ${r.login} (след. ${next ? next.toISOString() : "—"})`);
    }
  } catch (e) {
    console.error("[gtw-proxy] auto-reset failed:", e.message);
  }
}
/** Владелец чата: сначала кэш ЭТОГО логина (ключ login+chatId), затем БД. */
function chatOwnerLogin(login, chatId) {
  const k = chatKey(login, chatId);
  if (chatOwners.has(k)) return chatOwners.get(k);
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
    // я фактический пользователь чата (usage_stats) → разрешён, даже если реестр
    // chats записан на другой логин. Иначе ложный «Недостаточно прав»: чат мог
    // открываться админом/другим аккаунтом (реестр сменил владельца), а ходит в нём
    // прежний пользователь — его usage_stats-владение легитимно. Посторонний без
    // строки usage_stats по-прежнему блокируется ниже.
    const usageMine = getDb().prepare("SELECT 1 FROM usage_stats WHERE chat_id = ? AND login = ?").get(chatId, login);
    if (usageMine) return "";
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
function recordUsage(info, connLogin) {
  try {
    const chatId = String(info.chat_id || "");
    if (!chatId) return;
    const login = chatOwners.get(chatKey(connLogin, chatId)) || chatOwnerLogin(connLogin, chatId) || String(info.user_id || "");
    const u = info.usage || {};
    gtwDb.upsertUsageRow(getDb(), {
      chat_id: chatId, login, model: String(info.model || ""), provider: String(info.provider || ""),
      tokens_in: u.inTokens || 0, tokens_out: u.outTokens || 0,
      turns: info.turns || 0, tools: (info.tools && info.tools.count) || 0,
      speed: (info.speed && info.speed.tokensPerSec) || null, source: String(info.source || "unknown"),
      session_key: String(info.session_key || ""),
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[gtw-proxy] usage record failed:", e.message);
  }
}
// Ключ chat-state: login+chatId (волна 5): один chatId («main») у разных
// пользователей не должен перетирать чужие модель/владельца/ack.
const chatKey = (login, chatId) => login + "\u0000" + chatId;
const chatOwners = new Map(); // chat_id -> login (из user_message этой сессии)
const chatModels = new Map(); // chat_id -> "provider/model" (текущая модель из кадров шлюза)
// Подтверждённая применённая модель (из set_model_ack.ok; session_info — только пока
// не было ack). models.current и session_info могут нести дефолт профиля/устаревшую
// модель — пикер не должен откатываться на них после подтверждённого переключения.
const appliedModels = new Map(); // chat_id -> "provider/model" (display-форма)
// Чаты, где модель подтверждена set_model_ack: session_info не перетирает appliedModels
// (клиент шлёт session_info сразу после ack для метрик, и тот может нести старую модель).
const ackConfirmed = new Set();

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
/* W1-S7-STORE-START ── S7: зеркало src/lib/fileStore.ts isWithinStore ────────
 * storage_path берётся из БД и уходит адаптеру как host-путь файла, который
 * агент прочитает в песочнице. Строку в БД может подменить кто угодно с доступом
 * к реестру (админ-файловый роут, битая миграция, баг в роуте), поэтому путь
 * обязан лежать внутри стора: иначе /etc/shadow или чужой login/... уезжает
 * в контекст агента. Путь вне стора = файл ПРОПУСКАЕТСЯ (не падение чата). */
function isWithinStoreJs(p) {
  try {
    const root = path.resolve(FILESTORE_ROOT);
    const abs = path.resolve(String(p || ""));
    return abs === root || abs.startsWith(root + path.sep);
  } catch {
    return false;
  }
}
/* W1-S7-STORE-END */
/** Проект чата ({id,name,slug}) или null — для контекста агента и привязки артефактов. */
function chatProject(login, chatId) {
  try {
    const row = getDb()
      .prepare(
        `SELECT p.id, p.name, p.slug FROM chats c
         JOIN projects p ON p.id = c.project_id AND p.login = c.login
         WHERE c.login = ? AND c.chat_id = ?`
      )
      .get(login, chatId);
    return row || null;
  } catch {
    return null;
  }
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
  const proj = chatProject(login, chatId);
  getDb()
    .prepare(
      `INSERT INTO files (id, login, chat_id, project_id, direction, name, mime, size, storage_path, created_at)
       VALUES (?, ?, ?, ?, 'out', ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`
    )
    .run(id, login, chatId, proj ? proj.id : null, safe, finalMime, size, dest, new Date().toISOString());
  return { id, url: `/api/files/${id}`, name: safe, mime: finalMime, size };
}
/** Резолв вложений пользователя: только свои файлы (direction=in), с путём в сторе.
 *  scope = { chatId, projectId } — контекст ЗАПРОСА (чат, в котором отправляют).
 *  S7: путь вне стора и файл из чужого проекта/чата того же логина НЕ отдаём
 *  адаптеру (иначе переключением chat_id в кадре подмешивают контент другого
 *  проекта в контекст агента). */
function resolveAttachments(login, isAdmin, attachments, scope) {
  const out = [];
  if (!Array.isArray(attachments)) return out;
  const scopeChat = String((scope && scope.chatId) || "");
  const scopeProject = String((scope && scope.projectId) || "");
  for (const att of attachments.slice(0, 10)) {
    const fileId = String((att && att.fileId) || "");
    if (!fileId) continue;
    try {
      const row = getDb().prepare("SELECT * FROM files WHERE id = ?").get(fileId);
      if (!row || row.direction !== "in") continue;
      if (!isAdmin && row.login !== login) continue;
      // S7: привязка к контексту запроса. Файл с project_id обязан относиться
      // к проекту этого чата; файл без проекта — к этому чату (пустой chat_id =
      // загрузка вне чата, она остаётся доступной).
      const fileProject = String(row.project_id || "");
      if (fileProject && fileProject !== scopeProject) continue;
      const fileChat = String(row.chat_id || "");
      if (!fileProject && fileChat && fileChat !== scopeChat) continue;
      // S7: host-путь из реестра должен лежать внутри стора (anti-traversal).
      if (!row.storage_path || !isWithinStoreJs(row.storage_path)) continue;
      if (!fs.existsSync(row.storage_path)) continue;
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
  // Ядро матчера — общее с modelStore.isModelAllowed (gtwDb.mjs);
  // здесь только нормализация slug->display имён провайдеров.
  if (!allow || !allow.length) return true;
  return gtwDb.modelAllowedCore(allow.map((a) => normModelKey(a)), normModelKey(target));
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

/* ── W1-S4/S5: живая сверка куки и Origin при апгрейде /ws ──────────────────
 * Учётки из env (зеркало app/api/auth/login/route.ts и src/lib/userStore.ts):
 * env-владелец всегда admin, env-пользователь всегда user. */
const ENV_ADMIN_LOGIN = process.env.GTW_LOGIN || "demo";
const ENV_USER_LOGIN = process.env.GTW_USER_LOGIN || "";

/** Актуальная (живая) роль учётки по логину.
 *  Возвращает { role, kind }:
 *   kind="env"  — логин из env (роль фиксирована);
 *   kind="db"   — строка в users (роль = users.role);
 *   kind="gone" — строки в users НЕТ, но DB-учётки существуют ⇒ учётка удалена;
 *   kind="none" — учётных записей в БД вообще нет (env-only инсталляция/бенч),
 *                 логин не опознан ⇒ строгая сверка неприменима.
 *  Почему "none" не отказ: WS-тесты и стендовые скрипты форджируют куки для
 *  произвольных логинов, не создавая строк в users; отказывали бы — пала бы вся
 *  регрессия. В бою users непустой (учётки заводят через админку), поэтому там
 *  проверка строгая: кука переживает удаление аккаунта только пока в БД нет ни
 *  одной строки users, т.е. только в env-only конфигурации, где чужой логин
 *  неотличим от вымышленного. Ошибки БД — fail-open (как quota/allowlist): сбой
 *  реестра не должен рвать живые чаты; событие пишется в лог. */
function liveIdentity(login) {
  if (login === ENV_ADMIN_LOGIN) return { role: "admin", kind: "env" };
  if (ENV_USER_LOGIN && login === ENV_USER_LOGIN) return { role: "user", kind: "env" };
  try {
    const row = getDb().prepare("SELECT role FROM users WHERE login = ?").get(login);
    if (row) return { role: row.role === "admin" ? "admin" : "user", kind: "db" };
    const anyUser = getDb().prepare("SELECT 1 AS x FROM users LIMIT 1").get();
    return { role: null, kind: anyUser ? "gone" : "none" };
  } catch (e) {
    console.error("[gtw-proxy] live identity check failed:", e.message);
    return { role: null, kind: "none" };
  }
}

/** Отклонить ли апгрейд по результату живой сверки; undefined = кука действительна. */
function revokedReason(session) {
  const login = String(session.login);
  const live = liveIdentity(login);
  if (live.kind === "gone") return "session_revoked"; // учётка удалена из users
  // Эскалация роли: кука claim-ит admin, а актуальная роль не admin (разжалование
  // admin→user в users, или кука на env-пользователя). Занижение роли (env-владелец
  // с role=user) НЕ блокируем: привилегий от этого больше не становится, а фронт
  // и тесты такие куки используют легально.
  if (session.role === "admin" && live.role && live.role !== "admin") return "role_downgraded";
  return undefined;
}

/** S5: Origin апгрейда должен относиться тому же хосту, что и сам запрос.
 *  Без Origin (не-браузерные клиенты: curl, стендовые скрипты, healthcheck) —
 *  пускаем; браузеры Origin шлют всегда, поэтому CSWSH-запрос из чужой страницы
 *  здесь отсекается, а локальный бенч не ломается.
 *  Сравнение по hostname + порту; порт учитываем, только если он явно задан с
 *  обеих сторон (за прокси Host приходит без порта, Origin браузера — с 443/80). */
function originMismatch(req) {
  const raw = String(req.headers.origin || "").trim();
  if (!raw) return false; // Origin отсутствует — не браузер, не блокируем
  let o;
  try {
    o = new URL(raw);
  } catch {
    return true; // непарсящийся Origin — подозрительный, отказ
  }
  if (o.protocol !== "http:" && o.protocol !== "https:") return true;
  const oHost = o.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  const reqHostRaw = String(req.headers.host || "").trim();
  let rHost = reqHostRaw,
    rPort = "";
  const colon = reqHostRaw.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(reqHostRaw.slice(colon + 1))) {
    rHost = reqHostRaw.slice(0, colon);
    rPort = reqHostRaw.slice(colon + 1);
  }
  rHost = rHost.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (oHost !== rHost) return true;
  const oPort = o.port;
  if (!oPort || !rPort) return false; // порт задан только с одной стороны (прокси)
  return oPort !== rPort;
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
    /* W1-S5-UPGRADE: CSRF по WebSocket-протоколу (CSWSH): браузер при апгрейде
     * шлёт куку автоматически, без CORS и без SameSite-защиты от «моей же страницы
     * другого хоста». Отсекаем Origin, не совпадающий с хостом запроса; запросы
     * без Origin (не-браузерные клиенты) не трогаем. */
    if (originMismatch(req)) {
      console.warn(`[gtw-proxy] /ws upgrade отклонён: Origin=${req.headers.origin} host=${req.headers.host}`);
      rejectUpgrade(socket, 403, "Forbidden Origin");
      return;
    }
    /* W1-S5-UPGRADE-END */
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
      /* W1-S4-UPGRADE: кука подписана и не просрочена — но это НЕ значит, что
       * учётка жива. Токен живёт 7 дней и нигде не аннулируется: удалённый через
       * админку юзер и разжалованный admin продолжали бы получать WS-поток чужих
       * кадров и ходы в чатах, минуя REST-гейты. Поэтому перед pipeToAdapter
       * сверяем логин/роль куки с актуальным состоянием users/env и при отказе
       * закрываем соединение кодом 4401 (апп-код), НЕ соединяясь с адаптером.
       * Существующие гейты connChats/S1 ниже не затронуты. */
      const revoked = revokedReason(session);
      if (revoked) {
        console.warn(`[gtw-proxy] /ws upgrade отклонён: ${revoked} login=${session.login}`);
        try { client.close(4401, revoked); } catch {}
        return;
      }
      /* W1-S4-UPGRADE-END */
      pipeToAdapter(client, session);
    });
  });

  function pipeToAdapter(client, session) {
    const login = String(session.login);
    const isAdmin = session.role === "admin";
    // S1 (СЛОЙ 1): per-connection реестр чатов, которые ЭТО соединение вправе получать.
    // Предзаполняем своими зарегистрированными чатами (реестр chats + usage_stats):
    // вторая вкладка (cross-tab) получает кадры своих чатов без history-запроса.
    // Админ без фильтра (регистрирует любой чат, к которому обращается).
    const connChats = new Set(); // chat_id, которые это соединение вправе получать
    // Ключи chat-state, тронутые этим соединением (для очистки при закрытии).
    const touchedKeys = new Set();
    const ck = (cid) => { const k = chatKey(login, cid); touchedKeys.add(k); return k; };
    if (!isAdmin) {
      try {
        for (const r of getDb().prepare("SELECT chat_id FROM chats WHERE login = ?").all(login)) connChats.add(String(r.chat_id));
        for (const r of getDb().prepare("SELECT chat_id FROM usage_stats WHERE login = ?").all(login)) connChats.add(String(r.chat_id));
      } catch {}
    }
    const upstream = new WebSocket(GTW_WS_URL, {
      headers: { "X-GTW-Token": GTW_TOKEN },
      maxPayload: MAX_PAYLOAD,
      handshakeTimeout: 10000,
    });
    const pending = []; // кадры браузера до открытия апстрима ({data, isBinary})
    let opened = false;
    let closed = false;
    let bootModels = true; // первый кадр models — bootstrap-каталог для карты slug→display

    const liveEntry = { login, sendQuota: () => {} };
    liveClients.add(liveEntry);
    const closeBoth = (code, reason) => {
      if (closed) return;
      closed = true;
      liveClients.delete(liveEntry);
      // Последнее соединение логина закрыто — чистим его chat-state (анти-утечка памяти).
      if (![...liveClients].some((c) => c.login === login)) {
        for (const k of touchedKeys) {
          chatOwners.delete(k); chatModels.delete(k); appliedModels.delete(k); ackConfirmed.delete(k);
        }
      }
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
      let limit = null;
      let used = 0;
      try { ({ limit, used } = quotaFor(login)); } catch {}
      sendToClient({ type: "quota", login, limit, used });
    };
    liveEntry.sendQuota = sendQuota;
    sendQuota(); // стартовый снимок сразу при подключении

    upstream.on("open", () => {
      opened = true;
      // B1: наполняем карту slug→display ДО первого session_info (иначе новый чат
      // restricted-юзера получает chatModels в slug-форме и гейт блокирует РАЗРЕШЁННУЮ
      // модель). Служебный bootstrap-кадр в браузер не форвардим (флаг bootModels).
      // S1: role обязателен — слой 2 (adapter._broadcast) освобождает админа от фильтра
      // приватных кадров только по _sock_role, а регистрируется он с кадра, несущего role.
      try { upstream.send(JSON.stringify({ type: "models", chat_id: "main", user_id: login, user_name: login, role: isAdmin ? "admin" : "user" }), { binary: false }); } catch {}
      for (const { data, isBinary } of pending) {
        try { upstream.send(data, { binary: isBinary }); } catch {}
      }
      pending.length = 0;
    });
    upstream.on("message", (data, isBinary) => {
      let outData = data;
      /* W1-SNIFF: порог 256 КБ → 2 МБ. Каталог models у агрегаторов (Selectel
       * Router ~380 моделей) легко весит больше 256 КБ; кадр выше порога раньше
       * не сниффились вовсе — молча отключались и фильтр белого списка (пользователь
       * видел запрещённые модели), и учёт/нормализация модели. MAX_PAYLOAD = 4 МБ,
       * так что 2 МБ заведомо в пределах пересылаемого кадра. */
      if (!isBinary && data.length < 2 * 1024 * 1024) {
        const head = data.slice(0, 48).toString("utf8");
        if (head.includes('"session_info"') || head.includes('"models"') || head.includes('"set_model_ack"') || head.includes('"artifact"')) {
          try {
            const frame = JSON.parse(data.toString("utf8"));
            if (frame.type === "session_info" && frame.info) {
              recordUsage(frame.info, login);
              const inf = frame.info;
              if (inf.provider && inf.model) {
                const k = normModelKey(`${inf.provider}/${inf.model}`);
                const cid = String(inf.chat_id);
                // После подтверждённого переключения (ack) session_info может нести
                // устаревшую/профильную модель — не перетираем применённую.
                if (!ackConfirmed.has(ck(cid))) {
                  chatModels.set(ck(cid), k);
                  appliedModels.set(ck(cid), k);
                }
              }
              sendQuota(); // обновляем индикатор лимита после учёта токенов
            } else if (frame.type === "models") {
              learnProviders(frame.providers); // карта slug→display для гейта/пикера
              // bootstrap-каталог (запрос при open, chat_id "main"): только наполняем
              // карту, в браузер не шлём. Гасим именно "main", чтобы клиентский запрос
              // каталога (draft/реальный чат), пришедший сразу при подключении, не был
              // проглочен, даже если его ответ обогнал bootstrap-ответ.
              if (bootModels && String(frame.chat_id) === "main") { bootModels = false; return; }
              const cid = String(frame.chat_id);
              // Пикер показывает ПРИМЕНЁННУЮ модель (подтверждённую set_model_ack /
              // session_info), а не дефолт профиля из models.current: иначе открытие
              // пикера (повторный запрос models) откатывает метку на запрещённый дефолт,
              // а B1-защита autoSwitchTried уже не даёт переключить повторно.
              const applied = appliedModels.get(ck(cid));
              const cur = frame.current;
              if (applied && applied.includes("/")) {
                const i = applied.indexOf("/");
                frame.current = { provider: applied.slice(0, i), model: applied.slice(i + 1) };
                chatModels.set(ck(cid), applied);
                outData = Buffer.from(JSON.stringify(frame), "utf8");
              } else if (cur && cur.provider && cur.model) {
                // current к display: пикер подсвечивает текущую модель (ключи каталога —
                // display), гейт хранит chatModels в той же форме.
                cur.provider = providerSlugToDisplay.get(cur.provider) || cur.provider;
                chatModels.set(ck(cid), `${cur.provider}/${cur.model}`);
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
              if (mdl.includes("/")) {
                const cid = String(frame.chat_id);
                chatModels.set(ck(cid), mdl);
                appliedModels.set(ck(cid), mdl);
                ackConfirmed.add(ck(cid)); // применённая модель подтверждена — session_info её не перетрёт
              }
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
      // S1 (СЛОЙ 1): downstream-фильтр — чужой чат не форвардим браузеру.
      // Сниффинг выше (recordUsage/chatModels/артефакты) остаётся ДО фильтра:
      // внутренний учёт не зависит от доставки клиенту. Кадры БЕЗ chat_id
      // (hello, sessions, quota, error) и бинарные проходят как раньше.
      if (!isAdmin && !isBinary) {
        try {
          const f = JSON.parse(outData.toString("utf8"));
          const cid = String(f.chat_id || "");
          if (cid && !connChats.has(cid)) return; // чужой чат — не форвардим
        } catch {}
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
        // S1: нельзя начинать ход в чужом чате — иначе chatOwners (и _chat_owner
        // адаптера) перезаписывается на атакующего, а владелец теряет доступ к
        // своему чату (forbidden на history/session_info) — DoS-захват.
        const block = sessionInfoBlockOwner(chatId, login);
        if (!isAdmin && block && block !== login) {
          sendToClient({ type: "error", error: "forbidden" });
          return null;
        }
        chatOwners.set(ck(chatId), login);
        connChats.add(chatId); // S1: свой ход — это соединение вправе получать кадры чата
        const { limit, used } = quotaFor(login);
        if (limit !== null && used >= limit) {
          sendToClient({ type: "error", error: "quota_exceeded", limit, used });
          return null;
        }
        // Модель, выбранная ДО начала чата (welcome-экран, frame.model): применяем
        // к первому ходу той же set_model-инъекцией, что и авто-выбор B1 — иначе
        // B1 (cur пуст у нового чата) перезатрёт выбор пользователя первой разрешённой.
        const requestedModel = String(frame.model || "").trim();
        if (requestedModel) {
          if (!isAdmin && !modelAllowed(allowlistFor(login), requestedModel)) {
            sendToClient({ type: "error", error: "model_forbidden", model: requestedModel });
            return null;
          }
          chatModels.set(ck(chatId), requestedModel);
          const sm = JSON.stringify({ type: "set_model", chat_id: chatId, model: requestedModel, user_id: login, user_name: login });
          if (opened && upstream.readyState === WebSocket.OPEN) {
            try { upstream.send(sm, { binary: false }); } catch {}
          } else if (!closed && pending.length < 100) {
            pending.push({ data: sm, isBinary: false });
          }
          delete frame.model;
        } else if (!isAdmin) {
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
            const cur = chatModels.get(ck(chatId));
            const curOk = !!cur && modelAllowed(allow, cur);
            if (!curOk && allow && allow.length) {
              const target = allow[0];
              chatModels.set(ck(chatId), target);
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
        // контекст проекта: если чат привязан к проекту — передаём адаптеру slug/name,
        // чтобы агент работал в каталоге /root/projects/<slug> (фаза 3).
        const proj = chatProject(login, chatId);
        if (proj) {
          frame.project = { id: proj.id, name: proj.name, slug: proj.slug };
          // файлы проекта (имя + host-путь) — адаптер кладёт их в каталог проекта песочницы
          try {
            const rows = getDb()
              .prepare(
                `SELECT name, storage_path FROM files WHERE login = ? AND project_id = ? ORDER BY created_at DESC LIMIT 50`
              )
              .all(login, proj.id);
            /* W1-S7-PF: привязка уже по login+project_id этого чата; дополнительно
             * отбрасываем пути вне стора (подменённый storage_path) — такой файл
             * пропускается, чат не падает. */
            frame.project_files = rows
              .filter((r) => isWithinStoreJs(r.storage_path))
              .map((r) => ({ name: r.name, storage_path: r.storage_path }));
            /* W1-S7-PF-END */
          } catch {
            frame.project_files = [];
          }
        } else {
          delete frame.project;
          delete frame.project_files;
        }
        // вложения: только свои файлы (direction=in), адаптеру отдаём storage_path
        if (Array.isArray(frame.attachments) && frame.attachments.length) {
          /* W1-S7-ATT: скоуп = контекст запроса (этот чат и его проект). */
          frame.attachments = resolveAttachments(login, isAdmin, frame.attachments, {
            chatId,
            projectId: proj ? proj.id : null,
          });
          /* W1-S7-ATT-END */
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
        // S1: ownership-гейт + регистрация чата. Без гейта models-запрос регистрировал
        // бы чужой chat_id в connChats и открывал downstream-поток. Незарегистрированный
        // draft-чат (welcome-пикер) проходит: sessionInfoBlockOwner вернёт "".
        const chatId = String(frame.chat_id || "main");
        const block = sessionInfoBlockOwner(chatId, login);
        if (!isAdmin && block && block !== login) {
          sendToClient({ type: "error", error: "forbidden" });
          return null;
        }
        connChats.add(chatId);
        // каталог доступен всем; для не-админа ответ фильтруется по белому списку
        return raw;
      }
      if (type === "set_model") {
        // S1: ownership-гейт ПОСЛЕ allowlist-проверки (тот же порядок, что у history).
        if (!isAdmin && !modelAllowed(allowlistFor(login), String(frame.model || ""))) {
          sendToClient({ type: "error", error: "model_forbidden", model: String(frame.model || "") });
          return null;
        }
        const chatId = String(frame.chat_id || "main");
        const block = sessionInfoBlockOwner(chatId, login);
        if (!isAdmin && block && block !== login) {
          sendToClient({ type: "error", error: "forbidden" });
          return null;
        }
        connChats.add(chatId);
        // login из куки — чтобы /model применился к ТОЙ ЖЕ сессии, что и user_message
        // (иначе override уходит в сессию "gtw", а ходы идут в сессии login -> модель откатывается)
        const parsed = frame; // уже распарсен выше — повторный parse не нужен
        parsed.user_id = login;
        parsed.user_name = login;
        return JSON.stringify(parsed);
      }
      if (type === "history") {
        // S1: НОВЫЙ гейт — раньше history проходил raw, отдавая чужую историю любому.
        const chatId = String(frame.chat_id || "main");
        const block = sessionInfoBlockOwner(chatId, login);
        if (!isAdmin && block && block !== login) {
          sendToClient({ type: "error", error: "forbidden" });
          return null;
        }
        connChats.add(chatId);
        const parsed = frame; // уже распарсен выше — повторный parse не нужен
        parsed.user_id = login; // для слоя 2 (владелец на стороне адаптера)
        parsed.role = isAdmin ? "admin" : "user"; // роль из куки, не из клиента
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
        connChats.add(chatId); // S1: разрешённый session_info открывает downstream чата
        const owner = chatOwnerLogin(login, chatId);
        if (owner) chatOwners.set(ck(chatId), owner);
        return raw;
      }
      if (type === "browser_live") {
        // Live-просмотр браузера агента: только владелец чата или админ.
        const chatId = String(frame.chat_id || "main");
        const owner = chatOwnerLogin(login, chatId);
        if (!isAdmin && owner && owner !== login) {
          sendToClient({ type: "error", error: "forbidden" });
          return null;
        }
        connChats.add(chatId); // S1: зритель live вправе получать кадры этого чата
        const parsed = frame; // уже распарсен выше — повторный parse не нужен
        parsed.user_id = login; // login из подписанной куки, не из клиента
        parsed.user_name = login;
        parsed.role = isAdmin ? "admin" : "user"; // слой 2: soft-гейт browser_live
        return JSON.stringify(parsed);
      }
      if (type === "stop") {
        // Сессия задаётся login'ом из куки (как user_message), не клиентским user_id.
        const chatId = String(frame.chat_id || "main");
        const block = sessionInfoBlockOwner(chatId, login);
        if (!isAdmin && block && block !== login) {
          sendToClient({ type: "error", error: "forbidden" });
          return null;
        }
        connChats.add(chatId);
        const parsed = frame; // уже распарсен выше — повторный parse не нужен
        parsed.user_id = login;
        return JSON.stringify(parsed);
      }
      if (type === "approval_response" || type === "clarify_response") {
        // S1: инжектим user_id/role из куки (chat_id у этих кадров нет — гейтить
        // нечего); слой 2 проверяет владельца request_id/clarify_id на стороне адаптера.
        const parsed = frame; // уже распарсен выше — повторный parse не нужен
        parsed.user_id = login;
        parsed.role = isAdmin ? "admin" : "user";
        return JSON.stringify(parsed);
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
    // Авто-сброс расхода токенов по расписанию (проверка раз в минуту, время UTC).
    runAutoResets();
    setInterval(runAutoResets, 60000);
  });
});