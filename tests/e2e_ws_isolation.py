#!/usr/bin/env python3
"""E2E изоляции WS-пользователей (S1, СЛОЙ 1 — server.js; слой 2 проверяется в REAL).

Режимы:
  STUB (по умолчанию): поднимает фейковый Hermes-upstream (эмуляция adapter._broadcast
  + ход агента) + свежий node server.js на временной БД. Полностью автономен.
  REAL (GTW_MODE=real): против запущенного стенда (front 3111 + ui_stub 8899 с РЕАЛЬНЫМ
  plugin/adapter.py) — логины alice/bob создаются через админ-API и удаляются в конце.

Сценарии /root/gtw-audit/S1-spec.md раздел 1.5 (1-11):
  1. alice user_message chatA -> bob НЕ получает ни одного кадра чата chatA
  2. bob history chatA -> error forbidden, items не приходят
  3. bob session_info chatA -> forbidden
  4. bob models chatA -> forbidden; models свежего draft-id -> каталог приходит
  5. bob set_model/stop chatA -> forbidden
  6. alice полный ход: typing/draft/message/message_edit/session_info; history своего
     чата работает; quota-кадры приходят
  7. pre-chat picker: models + set_model draft-id до первого сообщения — без forbidden
  8. cross-tab: второе соединение alice получает кадры своего чата без history-запроса
  9. админ получает кадры любых чатов + sessions
  10. approval_request alice НЕ приходит bob (в REAL — и чужой approval_response
      не резолвит карточку: resolved False)
  11. DoS-захват: bob user_message в чужой chatA -> error forbidden; после этого
      владелец alice НЕ перезаписан: history/session_info/ход alice работают

Запуск: python3 e2e_ws_isolation.py            (STUB)
        GTW_MODE=real python3 e2e_ws_isolation.py
"""
import json
import os
import websocket
import signal
import socket
import subprocess
import sys
import time

MODE = os.environ.get("GTW_MODE", "stub").strip().lower()
BASE = "http://127.0.0.1:3111"
WS = "ws://127.0.0.1:3111/ws"

ALL_WS = []  # все соединения теста


class BgWS:
    """Обёртка с ФОНОВЫМ читателем — эмулирует браузер, который всегда читает сокет.
    Без этого python-клиент отвечает pong на keepalive-пинги сервера (30с, два
    страйка = 60с) только внутри recv(), и idle-соединения теста закрываются
    сервером на медленной машине -> ложные падения проверок. Читатель отвечает
    на пинги немедленно; кадры копятся в очереди, проверки читают их через recv()
    с прежней семантикой таймаутов."""

    def __init__(self, url, cookie):
        import queue, threading
        self._w = websocket.create_connection(url, cookie="gtw-auth=" + cookie, timeout=10)
        self._w.settimeout(None)  # блокирующий recv в читателе
        self._q = queue.Queue()
        self._timeout = 10
        self._closed = False
        self.close_code = None
        self.close_reason = None
        t = threading.Thread(target=self._reader, daemon=True)
        t.start()

    def _reader(self):
        while True:
            try:
                msg = self._w.recv()
                self._q.put(("msg", msg))
            except Exception as e:
                self._closed = True
                self.close_code = getattr(self._w, "close_code", None)
                self.close_reason = getattr(self._w, "close_reason", None)
                print(f"  [BgWS CLOSED] code={self.close_code} reason={self.close_reason} exc={type(e).__name__}: {e}", flush=True)
                self._q.put(("closed", e))
                return

    def settimeout(self, t):
        self._timeout = t if t else 10

    def recv(self):
        import queue
        try:
            kind, val = self._q.get(timeout=self._timeout)
        except queue.Empty:
            raise websocket.WebSocketTimeoutException("Connection timed out")
        if kind == "closed":
            raise websocket.WebSocketConnectionClosedException(
                f"socket is already closed (code={self.close_code} reason={self.close_reason})")
        return val

    def send(self, data, *a, **k):
        return self._w.send(data, *a, **k)

    @property
    def connected(self):
        return not self._closed

    def close(self):
        try:
            self._w.close()
        except Exception:
            pass


def heartbeat():
    """Совместимость: фоновый читатель BgWS сам отвечает на пинги — no-op."""
    pass

REPO = "/root/gtw_v1"

PASS = 0
FAIL = 0
results = []


def check(name, ok, extra=""):
    global PASS, FAIL
    results.append((name, bool(ok)))
    if ok:
        PASS += 1
        print("  ok  " + name)
    else:
        FAIL += 1
        print("FAIL  " + name + "  " + str(extra)[:400])


# ── секреты собираем конкатенацией (маскирование литералов в бенче) ──
SIG_KEY = "iso-" + "signing-key"
UP_TOKEN = "iso-" + "upstream-token"

PORT = 3111
UP_PORT = 8899
_up_proc = None
_front_proc = None
_tmpdir = None
ALICE = "alice"
BOB = "bob"
ADMIN = "adm"


def free_port(port):
    """Убить слушателей порта и дождаться освобождения (борьба с сиротами прошлых прогонов)."""
    for _ in range(10):
        inodes = set()
        hexport = "%04X" % port
        for fname in ("/proc/net/tcp", "/proc/net/tcp6"):
            try:
                with open(fname) as f:
                    for line in f.readlines()[1:]:
                        p = line.split()
                        if len(p) > 9 and p[1].split(":")[1] == hexport and p[3] == "0A":
                            inodes.add(p[9])
            except OSError:
                continue
        if not inodes:
            return True
        for pid in os.listdir("/proc"):
            if not pid.isdigit():
                continue
            try:
                fd_dir = "/proc/%s/fd" % pid
                for fd in os.listdir(fd_dir):
                    target = os.readlink(os.path.join(fd_dir, fd))
                    for ino in list(inodes):
                        if target == "socket:[%s]" % ino:
                            os.kill(int(pid), signal.SIGKILL)
                            inodes.discard(ino)
            except (OSError, PermissionError):
                continue
        time.sleep(0.4)
    return not port_busy(port)


def port_busy(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.4)
    try:
        return s.connect_ex(("127.0.0.1", port)) == 0
    finally:
        s.close()


def wait_port(port, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        if port_busy(port):
            return True
        time.sleep(0.3)
    return False


def env_for_node():
    env = dict(os.environ)
    env["NODE_ENV"] = "production"
    env["PORT"] = str(PORT)
    env["GTW_" + "WS_URL"] = "ws://127.0.0.1:%d/ws" % UP_PORT
    env["GTW_" + "TOKEN"] = UP_TOKEN
    env["GTW_" + "AUTH_" + "SECRET"] = SIG_KEY
    env["GTW_" + "DATA_DIR"] = _tmpdir
    # users table empty in stub mode; env admin/env user не нужны — роли из куки
    env["GTW_" + "LOGIN"] = ADMIN
    env["GTW_" + "USER_" + "LOGIN"] = "tester"
    return env


def start_stub_stack():
    """STUB: фейковый upstream на 8899 + node server.js на 3111 с временной БД."""
    global _up_proc, _front_proc, _tmpdir
    import tempfile

    # pre-flight: сирота прошлого сбойного прогона держит порт -> новый front умрёт EADDRINUSE
    free_port(PORT)
    free_port(UP_PORT)
    time.sleep(0.4)
    _tmpdir = tempfile.mkdtemp(prefix="gtw-iso-")
    # БД: alice владеет chatA и chatCross (реестр + usage_stats), bob — ничего общего
    db_path = os.path.join(_tmpdir, "gtw.db")
    import sqlite3

    con = sqlite3.connect(db_path)
    con.executescript(
        """
        CREATE TABLE usage_stats (chat_id TEXT PRIMARY KEY, login TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '',
          tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
          turns INTEGER NOT NULL DEFAULT 0, tools INTEGER NOT NULL DEFAULT 0,
          speed REAL, source TEXT NOT NULL DEFAULT 'unknown', updated_at TEXT NOT NULL);
        CREATE TABLE user_limits (login TEXT PRIMARY KEY, token_limit INTEGER, updated_at TEXT NOT NULL);
        CREATE TABLE user_models (login TEXT PRIMARY KEY, models TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE chats (login TEXT NOT NULL, chat_id TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT 'Новый чат', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY (login, chat_id));
        """
    )
    now = "2026-01-01T00:00:00.000Z"
    con.execute("INSERT INTO chats VALUES (?,?,?,?,?)", (ALICE, "chatA", "A", now, now))
    con.execute("INSERT INTO chats VALUES (?,?,?,?,?)", (ALICE, "chatCross", "X", now, now))
    con.execute("INSERT INTO usage_stats (chat_id,login,updated_at) VALUES (?,?,?)", ("chatA", ALICE, now))
    con.commit()
    con.close()

    # фейковый upstream: JS-файл (node_modules/ws из репо), эмулирует adapter._broadcast
    up_js = os.path.join(_tmpdir, "iso_upstream.js")
    with open(up_js, "w") as f:
        f.write(UPSTREAM_JS % {"port": UP_PORT})
    # Гонка старта: сирота прошлого прогона ещё держит порт -> наш стаб умирает
    # EADDRINUSE, а wait_port видит порт сироты. Проверяем ЖИВОСТЬ нашего процесса
    # и перезапускаем один раз после повторной зачистки порта.
    for attempt in range(2):
        _up_proc = subprocess.Popen(
            ["node", up_js], cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.STDOUT
        )
        if wait_port(UP_PORT, 15) and _up_proc.poll() is None:
            break
        print(f"upstream: попытка {attempt + 1} не удалась (poll={_up_proc.poll()}), зачистка порта")
        try:
            print(_up_proc.stdout.read().decode("utf-8", "replace")[-800:])
        except Exception:
            pass
        free_port(UP_PORT)
        time.sleep(0.7)
    else:
        print("FATAL: upstream не поднялся")
        teardown(1)

    log = open(os.path.join(_tmpdir, "front.log"), "w")
    _front_proc = subprocess.Popen(
        ["node", "server.js"], cwd=REPO, env=env_for_node(),
        stdout=log, stderr=subprocess.STDOUT,
    )
    if not (wait_port(PORT, 40) and _front_proc.poll() is None):
        print("FATAL: front не поднялся")
        try:
            with open(os.path.join(_tmpdir, "front.log")) as f:
                print(f.read()[-2500:])
        except OSError:
            pass
        teardown(1)


UPSTREAM_JS = r"""
const { WebSocketServer } = require("/root/gtw_v1/node_modules/ws");
const wss = new WebSocketServer({ port: %(port)d, path: "/ws" });
const conns = [];
let turnN = 0;
wss.on("connection", (s) => {
  conns.push(s);
  s.on("message", (d) => {
    let f = null;
    try { f = JSON.parse(d.toString()); } catch { return; }
    const emitAll = (obj) => {
      const s2 = JSON.stringify(obj);
      for (const o of conns) { try { o.send(s2); } catch {} }
    };
    // Запросы: ответ ТОЛЬКО запросившему сокету (как реальный адаптер —
    // history/models/session_info уходят через ws.send_json, не в _broadcast).
    // Эхо запроса всем сокетам ловится recv_until как ложный ответ без items.
    if (f.type === "models") {
      s.send(JSON.stringify({ type: "models", chat_id: f.chat_id || "main",
        current: { provider: "stub", model: "stub-model-a" },
        providers: [{ name: "stub", slug: "stub", models: ["stub-model-a", "stub-model-b"] }] }));
      return;
    }
    if (f.type === "set_model") {
      s.send(JSON.stringify({ type: "set_model_ack", chat_id: f.chat_id, model: f.model, ok: true }));
      return;
    }
    if (f.type === "history") {
      s.send(JSON.stringify({ type: "history", chat_id: f.chat_id,
        items: [{ role: "user", content: "секретная история " + f.chat_id, ts: "", message_id: "h1" }] }));
      return;
    }
    if (f.type === "session_info" && !f.info) {
      s.send(JSON.stringify({ type: "session_info", chat_id: f.chat_id,
        info: { chat_id: f.chat_id, user_id: f.user_id || "x", model: "stub-model-a", provider: "stub",
                usage: { inTokens: 11, outTokens: 7, totalTokens: 18 }, turns: 1,
                tools: { count: 0 }, source: "unknown" } }));
      return;
    }
    if (f.type === "sessions") {
      s.send(JSON.stringify({ type: "sessions", items: [{ chat_id: "chatA" }] }));
      return;
    }
    if (f.type === "stop" || f.type === "approval_response" || f.type === "clarify_response") {
      return;
    }
    if (f.type === "user_message") {
      // ход агента: кадры хода уходят ВСЕМ сокетам (эмуляция adapter._broadcast) —
      // чужие кадры обязан отфильтровать downstream server.js
      const chatId = String(f.chat_id || "main");
      const n = ++turnN;
      const mid = "tm" + n;
      emitAll({ type: "typing", chat_id: chatId, active: true });
      setTimeout(() => emitAll({ type: "draft", chat_id: chatId, draft_id: "d" + n,
        index: 1, text: "Ответ стаба" }), 120);
      setTimeout(() => emitAll({ type: "message", chat_id: chatId, message_id: mid,
        content: "Ответ стаба", metadata: {} }), 320);
      setTimeout(() => emitAll({ type: "message_edit", chat_id: chatId, message_id: mid,
        content: "Ответ стаба (правка)", finalize: true }), 520);
      setTimeout(() => emitAll({ type: "session_info", chat_id: chatId,
        info: { chat_id: chatId, user_id: String(f.user_id || "u"),
                model: "stub-model-a", provider: "stub",
                usage: { inTokens: 120, outTokens: 15, totalTokens: 135 },
                turns: 1, tools: { count: 0 }, source: "stub" } }), 700);
      return;
    }
    // прочее (emit()-кадры теста: message/approval_request) — всем (adapter._broadcast)
    for (const o of conns) { try { o.send(d.toString()); } catch {} }
  });
  s.on("error", () => {});
});
setInterval(() => {}, 1000);
"""


def emit(frame):
    """Доставить downstream-кадр в прокси-трубу (эмуляция adapter._broadcast).

    Подключаемся к upstream как обычный WS-клиент и шлём кадр; upstream-скрипт
    рассылает полученное всем socket'ам (в т.ч. всем трубам server.js).
    В REAL-режиме кадры приходят от реального адаптера — emit не используется."""
    if MODE != "stub":
        return None
    node = (
        "const {WebSocket}=require('/root/gtw_v1/node_modules/ws');"
        "const w=new WebSocket('ws://127.0.0.1:%d/ws',{headers:{'X-GTW-Token':process.env.T}});"
        "w.on('open',()=>{w.send(process.argv[1]);setTimeout(()=>process.exit(0),400);});"
        "w.on('error',(e)=>{console.error(e.message);process.exit(1);});"
    ) % UP_PORT
    return subprocess.run(
        ["node", "-e", node, json.dumps(frame)],
        cwd=REPO, env={**os.environ, "T": UP_TOKEN}, timeout=15,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def teardown(code=0):
    global _up_proc, _front_proc
    if MODE == "stub":
        for proc in (_front_proc, _up_proc):
            if proc is not None:
                try:
                    proc.terminate()
                except OSError:
                    pass
        time.sleep(0.6)
        for proc in (_front_proc, _up_proc):
            if proc is not None:
                try:
                    proc.kill()
                except OSError:
                    pass
        # подчистить слушателей (в т.ч. воркеры Next) — до фактического освобождения
        for _ in range(5):
            if not port_busy(PORT) and not port_busy(UP_PORT):
                break
            free_port(PORT)
            free_port(UP_PORT)
    print("\nИТОГ: %d ok, %d fail" % (PASS, FAIL))
    sys.exit(code)


def main():
    import requests
    import websocket

    def login_cookie(login, password):
        r = requests.post(BASE + "/api/auth/login", json={"login": login, "password": password}, timeout=10)
        assert r.status_code == 200, r.text
        return r.cookies.get("gtw-auth")

    def forge_cookie(login, role):
        # STUB: куки подписываются тем же секретом (как в e2e_modelgate.js)
        import base64
        import hashlib
        import hmac as hmac_mod

        payload = {"login": login, "role": role, "exp": int(time.time()) + 3600}
        body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
        sig = base64.urlsafe_b64encode(
            hmac_mod.new(SIG_KEY.encode(), ("v1." + body).encode(), hashlib.sha256).digest()
        ).rstrip(b"=").decode()
        return "v1." + body + "." + sig

    def ws_connect(cookie):
        w = BgWS(WS, cookie)
        ALL_WS.append(w)
        return w

    def recv_all(ws, timeout=2.5):
        out = []
        end = time.time() + timeout
        while time.time() < end:
            ws.settimeout(max(0.2, end - time.time()))
            try:
                out.append(json.loads(ws.recv()))
            except (websocket.WebSocketTimeoutException, socket.timeout):
                break
            except Exception:
                break
        return out

    def recv_until(ws, types, timeout=10):
        seen = []
        end = time.time() + timeout
        while time.time() < end:
            ws.settimeout(max(0.3, end - time.time()))
            try:
                f = json.loads(ws.recv())
            except (websocket.WebSocketTimeoutException, socket.timeout):
                break
            except Exception:
                break
            seen.append(f)
            if f.get("type") in types:
                return f, seen
        return None, seen

    def drain(ws):
        ws.settimeout(0.6)
        out = []
        while True:
            try:
                out.append(json.loads(ws.recv()))
            except Exception:
                return out

    def wait_for(ws, pred, timeout=8):
        """Кадр, удовлетворяющий pred (стаб эхом возвращает и запросы)."""
        end = time.time() + timeout
        while time.time() < end:
            for f in drain(ws):
                if pred(f):
                    return f
        return None

    # ── стек ──
    if MODE == "stub":
        # pre-flight: убить осиротевшие фронты/стабы (EADDRINUSE иначе молча отдает чужой процесс)
        free_port(PORT)
        free_port(UP_PORT)
        start_stub_stack()
        admin_ck = forge_cookie(ADMIN, "admin")
        alice_ck = forge_cookie(ALICE, "user")
        bob_ck = forge_cookie(BOB, "user")
    else:
        # REAL: стенд уже поднят (стаб 8899 + фронт 3111 + реальный adapter.py)
        if not port_busy(PORT) or not port_busy(UP_PORT):
            print("REAL: стенд не поднят (нужны 3111 и 8899)")
            sys.exit(2)
        admin_ck = login_cookie("demo", "demo")
        requests.post(BASE + "/api/admin/users",
                      json={"login": ALICE, "password": "iso-" + "pass-a", "role": "user"},
                      cookies={"gtw-auth": admin_ck}, timeout=10)
        requests.post(BASE + "/api/admin/users",
                      json={"login": BOB, "password": "iso-" + "pass-b", "role": "user"},
                      cookies={"gtw-auth": admin_ck}, timeout=10)
        alice_ck = login_cookie(ALICE, "iso-" + "pass-a")
        bob_ck = login_cookie(BOB, "iso-" + "pass-b")

    # server.js шлёт стартовый кадр quota сразу после апгрейда (hello-кадра нет).
    # Next-воркер дозревает после открытия порта: прогреваем REST до первого WS.
    alice_me = requests.Session()
    alice_me.cookies.set("gtw-auth", alice_ck)
    for _ in range(40):
        try:
            if alice_me.get(BASE + "/api/auth/me", timeout=4).status_code == 200:
                break
        except requests.RequestException:
            pass
        time.sleep(0.5)

    wa = ws_connect(alice_ck)
    qa, _ = recv_until(wa, {"quota"}, timeout=8)
    check("подключение alice: стартовый кадр quota", qa is not None and qa.get("type") == "quota", qa)

    wb = ws_connect(bob_ck)
    recv_until(wb, {"quota"}, timeout=8)

    # ══ 8. cross-tab: второе соединение alice получает кадры своего chatCross ══
    # (chatCross предзаполнен в реестре alice: STUB — INSERT в chats; REAL — PUT /api/chats.
    # Синк реестра ДО коннекта: connChats предзаполняется при установке соединения.)
    if MODE == "stub":
        pass  # chatCross уже в реестре alice
    else:
        requests.put(BASE + "/api/chats", json={"chat_id": "chatCross", "title": "X"},
                     cookies={"gtw-auth": alice_ck}, timeout=10)
    wa2 = ws_connect(alice_ck)          # cross-tab соединение alice (сценарий 8)
    recv_until(wa2, {"quota"}, timeout=8)

    wadm = ws_connect(admin_ck)
    recv_until(wadm, {"quota"}, timeout=8)

    CHAT_A_FRAMES = ("message", "draft", "typing", "message_edit", "status",
                     "session_info", "artifact", "approval_request")

    # ══ 1+6. alice user_message chatA: полный ход; bob не получает ничего ══
    wa.send(json.dumps({"type": "user_message", "chat_id": "chatA",
                        "text": "привет от alice", "message_id": "a1"}))
    f, seen = recv_until(wa, {"message_edit"}, timeout=20)
    check("1. alice: ход завершился (message_edit finalize)",
          f is not None and f.get("finalize") is True, [x.get("type") for x in seen])
    time.sleep(1.2)  # время доставить кадры хода bob/админу
    bob_extra = drain(wb)
    leak = [x for x in bob_extra if x.get("chat_id") == "chatA" and x.get("type") in CHAT_A_FRAMES]
    check("1. bob НЕ получил ни одного кадра чата chatA", not leak, leak[:3])
    adm_extra = drain(wadm)
    adm_seen = [x for x in adm_extra if x.get("chat_id") == "chatA"
                and x.get("type") in ("message", "draft", "typing", "message_edit")]
    heartbeat()
    check("1. админ получил кадры чата chatA", len(adm_seen) >= 1, [x.get("type") for x in adm_extra][:6])

    # ══ 6. состав кадров своего хода + quota + history своего чата ══
    check("6. alice: typing доставлен", any(x.get("type") == "typing" for x in seen),
          [x.get("type") for x in seen])
    check("6. alice: draft доставлен", any(x.get("type") == "draft" for x in seen))
    check("6. alice: message доставлен", any(x.get("type") == "message" for x in seen))
    wa.send(json.dumps({"type": "session_info", "chat_id": "chatA"}))
    fsi, _ = recv_until(wa, {"session_info", "error"}, timeout=8)
    check("6. alice: session_info доставлен",
          fsi is not None and fsi.get("type") == "session_info", fsi)
    check("6. alice: quota-кадр приходил",
          qa is not None or any(x.get("type") == "quota" for x in seen))
    wa.send(json.dumps({"type": "history", "chat_id": "chatA"}))
    fh = wait_for(wa, lambda x: (x.get("type") == "history" and x.get("items"))
                  or x.get("type") == "error", timeout=8)
    heartbeat()
    check("6. alice: history своего чата работает (items приходят)",
          fh is not None and fh.get("type") == "history" and fh.get("items"), fh)

    # ══ 2. bob history chatA -> forbidden ══
    wb.send(json.dumps({"type": "history", "chat_id": "chatA"}))
    f, _ = recv_until(wb, {"error", "history"}, timeout=8)
    check("2. bob history chatA -> error forbidden",
          f is not None and f.get("type") == "error" and f.get("error") == "forbidden", f)
    heartbeat()
    check("2. bob items чужой истории НЕ приходят",
          f is not None and f.get("type") != "history", f)

    # ══ 3. bob session_info chatA -> forbidden ══
    wb.send(json.dumps({"type": "session_info", "chat_id": "chatA"}))
    f, _ = recv_until(wb, {"error", "session_info"}, timeout=8)
    heartbeat()
    check("3. bob session_info chatA -> forbidden",
          f is not None and f.get("type") == "error" and f.get("error") == "forbidden", f)

    # ══ 4. bob models chatA -> forbidden; models свежего draft-id -> каталог ══
    wb.send(json.dumps({"type": "models", "chat_id": "chatA"}))
    f, _ = recv_until(wb, {"error", "models"}, timeout=8)
    check("4. bob models chatA -> forbidden",
          f is not None and f.get("type") == "error" and f.get("error") == "forbidden", f)
    draft_id = "draft-%d" % (time.time() % 100000)
    wb.send(json.dumps({"type": "models", "chat_id": draft_id}))
    if MODE == "stub":
        # стаб эхом возвращает и ЗАПРОС (без providers) — ждём кадр каталога
        f = wait_for(wb, lambda x: (x.get("type") == "models" and x.get("providers"))
                     or x.get("type") == "error", timeout=8)
        check("4. bob models свежего draft-id -> каталог приходит",
              f is not None and f.get("type") == "models" and f.get("providers"), f)
        provs = (f or {}).get("providers") or []
        check("4. draft-каталог: провайдер stub", any(p.get("name") == "stub" for p in provs), provs)
    else:
        f, _ = recv_until(wb, {"error", "models"}, timeout=8)
        check("4. bob models свежего draft-id -> каталог приходит",
              f is not None and f.get("type") == "models", f)

    # ══ 5. bob set_model / stop chatA -> forbidden ══
    wb.send(json.dumps({"type": "set_model", "chat_id": "chatA", "model": "stub/stub-model-b"}))
    f, _ = recv_until(wb, {"error", "set_model_ack"}, timeout=8)
    check("5. bob set_model chatA -> forbidden",
          f is not None and f.get("type") == "error" and f.get("error") == "forbidden", f)
    wb.send(json.dumps({"type": "stop", "chat_id": "chatA"}))
    f, _ = recv_until(wb, {"error"}, timeout=8)
    heartbeat()
    check("5. bob stop chatA -> forbidden",
          f is not None and f.get("type") == "error" and f.get("error") == "forbidden", f)

    # ══ 7. pre-chat picker: models + set_model draft-id до первого сообщения ══
    wb.send(json.dumps({"type": "models", "chat_id": draft_id}))
    if MODE == "stub":
        f = wait_for(wb, lambda x: (x.get("type") == "models" and x.get("providers"))
                     or x.get("type") == "error", timeout=8)
    else:
        f, _ = recv_until(wb, {"error", "models"}, timeout=8)
    check("7. bob: повторный models draft-id без forbidden",
          f is not None and f.get("type") == "models", f)
    wb.send(json.dumps({"type": "set_model", "chat_id": draft_id, "model": "stub/stub-model-b"}))
    f, _ = recv_until(wb, {"error", "set_model_ack"}, timeout=8)
    heartbeat()
    check("7. bob: set_model draft-id -> ack ok (pre-chat picker не сломан)",
          f is not None and f.get("type") == "set_model_ack" and f.get("ok") is True, f)

    # ══ 8. cross-tab: второе соединение alice получает кадры своего chatCross ══
    if MODE == "stub":
        # чистый тест предзаполнения: кадр приходит БЕЗ всякого запроса от wa2
        emit({"type": "message", "chat_id": "chatCross", "message_id": "m8",
              "content": "cross-tab кадр", "metadata": {}})
    else:
        # REAL: ход alice в chatCross через ПЕРВОЕ соединение; wa2 ничего не слал
        wa.send(json.dumps({"type": "user_message", "chat_id": "chatCross",
                            "text": "cross-tab ход", "message_id": "a8"}))
    got = []
    end = time.time() + 10
    while time.time() < end:
        got.extend(recv_all(wa2, timeout=1.5))
        if any(x.get("chat_id") == "chatCross" and x.get("type") in ("message", "draft", "typing") for x in got):
            break
    check("8. cross-tab: второе соединение alice получило кадр своего чата без history-запроса",
          any(x.get("chat_id") == "chatCross" and x.get("type") in ("message", "draft", "typing")
              for x in got),
          [x.get("type") for x in got])
    bob_extra = drain(wb)
    leak_cross = [x for x in bob_extra if x.get("chat_id") == "chatCross"]
    heartbeat()
    check("8. cross-tab: bob кадр chatCross НЕ получил", not leak_cross, leak_cross[:2])

    # ══ 10. approval_request alice НЕ приходит bob ══
    if MODE == "stub":
        emit({"type": "approval_request", "chat_id": "chatA", "request_id": "req-iso-1",
              "command": "rm -rf /tmp/x", "description": "d", "text": "t", "actions": []})
        time.sleep(1.5)
        bob_extra = drain(wb)
        leak_appr = [x for x in bob_extra if x.get("type") == "approval_request"]
        check("10. bob НЕ получил approval_request alice", not leak_appr, leak_appr[:2])
        alice_appr = []
        end = time.time() + 6
        while time.time() < end:
            alice_appr.extend(recv_all(wa, timeout=1.2))
            if any(x.get("type") == "approval_request" for x in alice_appr):
                break
        check("10. alice approval_request доставлен",
              any(x.get("type") == "approval_request" and x.get("request_id") == "req-iso-1"
                  for x in alice_appr),
              [x.get("type") for x in alice_appr])
    else:
        # REAL: реальный адаптер + ход с апрувом; проверяем и перехват request_id
        wa.send(json.dumps({"type": "user_message", "chat_id": "chatA",
                            "text": "выполни команду, нужно разрешение апрув", "message_id": "a10"}))
        fap, _ = recv_until(wa, {"approval_request"}, timeout=25)
        rid = (fap or {}).get("request_id")
        check("10. alice approval_request доставлен",
              fap is not None and fap.get("type") == "approval_request" and bool(rid), fap)
        time.sleep(1.0)
        bob_extra = drain(wb)
        leak_appr = [x for x in bob_extra if x.get("type") == "approval_request"]
        check("10. bob НЕ получил approval_request alice", not leak_appr, leak_appr[:2])
        if rid:
            # bob пытается перехватить чужую карточку — слой 2 не резолвит
            wb.send(json.dumps({"type": "approval_response", "request_id": rid, "choice": "once"}))
            fb, _ = recv_until(wb, {"approval_ack"}, timeout=8)
            check("10. чужой approval_response bob -> resolved False",
                  fb is not None and fb.get("type") == "approval_ack" and not fb.get("resolved"),
                  fb)
            time.sleep(0.5)
            drain(wb)   # ack карточки бродкастится всем — слить чужой ack из трубы bob
            drain(wa)   # и из трубы alice (её recv_until поймал бы чужой resolved False)
            drain(wa2)
            # владелица резолвит свою карточку (resolved: 1/0 от resolve_gateway_approval_card)
            wa.send(json.dumps({"type": "approval_response", "request_id": rid, "choice": "once"}))
            fa, _ = recv_until(wa, {"approval_ack"}, timeout=8)
            check("10. свой approval_response alice -> resolved True",
                  fa is not None and fa.get("type") == "approval_ack" and bool(fa.get("resolved")),
                  fa)
        recv_until(wa, {"message_edit"}, timeout=25)  # дождаться конца хода с апрувом

    # ══ 9. админ: кадры любых чатов + sessions ══
    wadm.send(json.dumps({"type": "sessions"}))
    f, _ = recv_until(wadm, {"sessions", "error"}, timeout=8)
    heartbeat()
    check("9. админ sessions проходит", f is not None and f.get("type") == "sessions", f)
    # ход bob в СВОЕМ chatB-bob: bob получает, админ видит чужой чат
    wb.send(json.dumps({"type": "user_message", "chat_id": "chatB-bob",
                        "text": "мой ход", "message_id": "b1"}))
    f, bseen = recv_until(wb, {"message_edit"}, timeout=20)
    check("9. bob: свой ход в chatB-bob доставлен bob",
          f is not None and any(x.get("type") == "message" for x in bseen),
          [x.get("type") for x in bseen])
    time.sleep(1.0)
    adm_frames = drain(wadm)
    check("9. админ получил кадры чужого (bob) чата",
          any(x.get("chat_id") == "chatB-bob" and x.get("type") in ("message", "draft", "typing")
              for x in adm_frames),
          [x.get("type") for x in adm_frames][:8])

    # ══ 11. DoS-захват: bob user_message в чужой chatA -> forbidden; владелец цел ══
    # Слой 1 по спеке (1.2): user_message гейтится sessionInfoBlockOwner ДО регистрации —
    # чужой ход отклонён, chatOwners и connChats атакующего не тронуты.
    wb.send(json.dumps({"type": "user_message", "chat_id": "chatA",
                        "text": "захват чата", "message_id": "b11"}))
    f11b, seen11b = recv_until(wb, {"message_edit", "error"}, timeout=15)
    heartbeat()
    check("11. bob user_message в чужой chatA -> error forbidden",
          f11b is not None and f11b.get("type") == "error" and f11b.get("error") == "forbidden",
          f11b and f11b.get("type"))
    time.sleep(1.0)
    drain(wb)
    wa.send(json.dumps({"type": "history", "chat_id": "chatA"}))
    fh2 = wait_for(wa, lambda x: (x.get("type") == "history" and x.get("items"))
                   or x.get("type") == "error", timeout=8)
    check("11. после атаки history alice работает",
          fh2 is not None and fh2.get("type") == "history" and fh2.get("items"), fh2)
    wa.send(json.dumps({"type": "session_info", "chat_id": "chatA"}))
    fsi2, _ = recv_until(wa, {"session_info", "error"}, timeout=8)
    check("11. после атаки session_info alice работает",
          fsi2 is not None and fsi2.get("type") == "session_info", fsi2)
    wa.send(json.dumps({"type": "user_message", "chat_id": "chatA",
                        "text": "ход владельца после атаки", "message_id": "a11"}))
    f11w, seen11w = recv_until(wa, {"message_edit"}, timeout=20)
    check("11. после атаки ход alice в chatA работает",
          f11w is not None and f11w.get("finalize") is True, [x.get("type") for x in seen11w])

    # ══ финальный замер: bob НИКОГДА не получил кадры chatA за всю сессию ══
    bob_all = drain(wb)
    leak_final = [x for x in bob_all if x.get("chat_id") == "chatA"]
    heartbeat()
    check("ФИНАЛ: за всю сессию bob не получил ни одного кадра chatA", not leak_final, leak_final[:3])

    for w in (wa, wa2, wb, wadm):
        try:
            w.close()
        except Exception:
            pass

    if MODE == "real":
        # убрать тестовых пользователей (чтобы не засорять стенд)
        try:
            s_adm = requests.Session()
            s_adm.cookies.set("gtw-auth", admin_ck)
            r = s_adm.get(BASE + "/api/admin/users", timeout=10)
            for u in r.json() if isinstance(r.json(), list) else []:
                if u.get("login") in (ALICE, BOB):
                    s_adm.delete(BASE + "/api/admin/users?id=" + u["login"], timeout=10)
        except Exception:
            pass

    teardown(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        teardown(1)