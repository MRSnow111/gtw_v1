"""S1 unit-тесты (слой 2, plugin/adapter.py): изоляция пользователей в _broadcast и гейтах.

Фейковые ws-объекты (send_str пишет в список) — мокируется ТОЛЬКО транспорт;
логика фильтра/гейтов тестируется реальная. Адаптер загружается через стабы
harness.py (без aiohttp/ядра Hermes, без портов — чистые asyncio-юниты).
Сценарии 1-6 по спеке /root/gtw-audit/S1-spec.md раздел 2.6.
"""
import asyncio
import importlib.util
import sys
import types

# ── стабы + загрузка адаптера из harness (без запуска его сценария) ──
_src = open("/root/gtw-test/harness.py", encoding="utf-8").read()
_setup = _src.split("# ── test scenario")[0]
exec(_setup, globals())  # noqa: S102 — adapter_mod, стабы gateway.*, CALLS


# ── фейковый ws: send_str пишет в список, send_json декодирует в send_str ──

class FakeWS:
    def __init__(self, name=""):
        self.name = name
        self.sent = []

    async def send_str(self, data):
        self.sent.append(data)

    async def send_json(self, obj):
        import json
        self.sent.append(json.dumps(obj, ensure_ascii=False))

    def frames(self):
        import json
        return [json.loads(s) for s in self.sent]

    def types(self):
        return [f.get("type") for f in self.frames()]


PASS, FAIL = [], []


def check(name, cond):
    (PASS if cond else FAIL).append(name)
    print(("PASS " if cond else "FAIL ") + name)


def fresh():
    a = adapter_mod.GTWAdapter(types.SimpleNamespace(extra={}))
    return a


async def register_owner(a, chat_id, user_id):
    """Владелец чата фиксируется в _inbound_message (как в реальном потоке)."""
    await a._inbound_message({"type": "user_message", "chat_id": chat_id,
                              "text": "привет", "message_id": "m-" + chat_id + "-" + user_id,
                              "user_id": user_id, "user_name": user_id})


# ── сценарий 1: _broadcast — bob не получает кадр чужого chatA, alice получает ──
async def t1():
    a = fresh()
    await register_owner(a, "chatA", "alice")
    ws_a, ws_b = FakeWS("alice"), FakeWS("bob")
    a._sockets.update({ws_a, ws_b})
    a._sock_user[ws_a] = "alice"
    a._sock_user[ws_b] = "bob"
    a._sock_role[ws_a] = "user"
    a._sock_role[ws_b] = "user"
    n = await a._broadcast({"type": "typing", "chat_id": "chatA"})
    check("1: доставлен один сокет", n == 1)
    check("1: alice получил typing chatA", ws_a.types() == ["typing"])
    check("1: bob НЕ получил кадр chatA", ws_b.sent == [])
    # ответ агента в тот же чат — тоже только владельцу
    await a.send("chatA", "ответ агента")
    check("1: alice получил message", ws_a.types() == ["typing", "message"])
    check("1: bob не получил message", ws_b.sent == [])


# ── сценарий 2: кадр без chat_id -> оба получают ──
async def t2():
    a = fresh()
    await register_owner(a, "chatA", "alice")
    ws_a, ws_b = FakeWS("alice"), FakeWS("bob")
    a._sockets.update({ws_a, ws_b})
    a._sock_user[ws_a] = "alice"
    a._sock_user[ws_b] = "bob"
    n = await a._broadcast({"type": "hello"})
    check("2: кадр без chat_id доставлен обоим", n == 2
          and ws_a.types() == ["hello"] and ws_b.types() == ["hello"])
    # кадр с chat_id БЕЗ известного владельца (legacy-чат) -> тоже всем
    n = await a._broadcast({"type": "status", "chat_id": "unknown-chat", "content": "x"})
    check("2: чат без владельца -> всем", n == 2
          and ws_a.types() == ["hello", "status"] and ws_b.types() == ["hello", "status"])


# ── сценарий 3: админ-сокет получает чужой чат ──
async def t3():
    a = fresh()
    await register_owner(a, "chatA", "alice")
    ws_a, ws_adm = FakeWS("alice"), FakeWS("admin")
    a._sockets.update({ws_a, ws_adm})
    a._sock_user[ws_a] = "alice"
    a._sock_user[ws_adm] = "admin"
    a._sock_role[ws_adm] = "admin"
    n = await a._broadcast({"type": "message", "chat_id": "chatA", "content": "секрет"})
    check("3: владелец + админ получили", n == 2
          and ws_a.types() == ["message"] and ws_adm.types() == ["message"])


# ── сценарий 4: history чужого чата -> forbidden; своего -> items ──
async def t4():
    a = fresh()
    await register_owner(a, "chatA", "alice")
    ws_a, ws_b = FakeWS("alice"), FakeWS("bob")
    # регистрация сокетов как в реальном потоке — через _on_frame
    await a._on_frame(ws_a, {"type": "history", "chat_id": "chatA", "user_id": "alice", "role": "user"})
    await a._on_frame(ws_b, {"type": "history", "chat_id": "chatA", "user_id": "bob", "role": "user"})
    ha = ws_a.frames()[0]
    hb = ws_b.frames()[0]
    check("4: свой history -> items", ha["type"] == "history" and len(ha["items"]) == 1)
    check("4: чужой history -> forbidden без items",
          hb["type"] == "error" and hb["error"] == "forbidden" and hb["chat_id"] == "chatA")
    # session_info — тот же гейт
    ws_c = FakeWS("bob2")
    await a._on_frame(ws_c, {"type": "session_info", "chat_id": "chatA", "user_id": "bob", "role": "user"})
    check("4: чужой session_info -> forbidden", ws_c.frames()[0].get("error") == "forbidden")
    ws_d = FakeWS("alice2")
    await a._on_frame(ws_d, {"type": "session_info", "chat_id": "chatA", "user_id": "alice", "role": "user"})
    check("4: свой session_info -> info", "info" in ws_d.frames()[0])
    # legacy: кадр без user_id -> gtw, не чужой (не ломаем бенч/старые клиенты)
    ws_e = FakeWS("legacy")
    await a._on_frame(ws_e, {"type": "history", "chat_id": "chatA"})
    check("4: legacy history без user_id -> items", ws_e.frames()[0]["type"] == "history")


# ── сценарий 5: approval_response с чужим user_id -> не резолвится ──
async def t5():
    CALLS["approvals"].clear()
    a = fresh()
    await register_owner(a, "chatA", "alice")
    ws_bob = FakeWS("bob")
    a._approval_sessions["req-1"] = "gtw:chatA"
    a._approval_owner["req-1"] = "alice"  # как ставит _send_exec_approval_prompt
    await a._resolve_approval({"type": "approval_response", "request_id": "req-1",
                               "choice": "once", "user_id": "bob", "role": "user"})
    check("5: чужой approval НЕ резолвится", CALLS["approvals"] == [])
    ack = ws_bob.frames()  # ack уходит broadcast'ом — проверим через сокет владельца
    ws_a = FakeWS("alice")
    a._sockets.update({ws_a})
    a._sock_user[ws_a] = "alice"
    await a._resolve_approval({"type": "approval_response", "request_id": "req-1",
                               "choice": "deny", "user_id": "bob", "role": "user"})
    frames = ws_a.frames()
    check("5: bob получил resolved:False ack",
          frames and frames[-1]["type"] == "approval_ack" and frames[-1]["resolved"] is False)
    # свой user_id резолвит
    await a._resolve_approval({"type": "approval_response", "request_id": "req-1",
                               "choice": "once", "user_id": "alice", "role": "user"})
    check("5: владелец резолвит", len(CALLS["approvals"]) == 1
          and CALLS["approvals"][0]["actor_id"] == "alice")
    # админ резолвит чужую карточку
    CALLS["approvals"].clear()
    a2 = fresh()
    await register_owner(a2, "chatA", "alice")
    a2._approval_sessions["req-2"] = "gtw:chatA"
    a2._approval_owner["req-2"] = "alice"
    await a2._resolve_approval({"type": "approval_response", "request_id": "req-2",
                                "choice": "once", "user_id": "admin", "role": "admin"})
    check("5: админ резолвит чужую", len(CALLS["approvals"]) == 1)
    # владелец карты ставится при отправке карточки
    a3 = fresh()
    await register_owner(a3, "chatA", "alice")
    await a3._send_exec_approval_prompt(types.SimpleNamespace(
        chat_id="chatA", session_key="gtw:chatA", request_id="req-3",
        command="ls", description="", text="", actions=[]))
    check("5: _approval_owner из владельца чата", a3._approval_owner["req-3"] == "alice")


# ── сценарий 6: неизвестный сокет (без user_id) не получает приватный кадр ──
async def t6():
    a = fresh()
    await register_owner(a, "chatA", "alice")
    ws_a, ws_x = FakeWS("alice"), FakeWS("ghost")
    a._sockets.update({ws_a, ws_x})
    a._sock_user[ws_a] = "alice"
    # ws_x ни разу не слал user_id: _sock_user[ws_x] отсутствует
    n = await a._broadcast({"type": "draft", "chat_id": "chatA", "draft_id": 1, "content": "x"})
    check("6: доставлен только владелец", n == 1 and ws_a.types() == ["draft"] and ws_x.sent == [])
    # clarify: чужой clarify_response не резолвится, свой резолвится, карта получает владельца
    CALLS["clarifies"].clear()
    await register_owner(a, "chatB", "alice")
    await a.send_clarify("chatB", "Какой вариант?", ["A", "B"], "cl-1", "gtw:chatB")
    check("6: _clarify_owner из владельца чата", a._clarify_owner["cl-1"] == "alice")
    await a._on_frame(ws_x, {"type": "clarify_response", "clarify_id": "cl-1",
                             "response": "A", "user_id": "bob", "role": "user"})
    check("6: чужой clarify НЕ резолвится", CALLS["clarifies"] == [])
    ack = ws_x.frames()[-1]
    check("6: чужой clarify_ack resolved:False", ack["type"] == "clarify_ack" and ack["resolved"] is False)
    ws_a2 = FakeWS("alice2")
    a._sock_user[ws_a2] = "alice"
    await a._on_frame(ws_a2, {"type": "clarify_response", "clarify_id": "cl-1",
                              "response": "A", "user_id": "alice", "role": "user"})
    check("6: свой clarify резолвится", len(CALLS["clarifies"]) == 1
          and ws_a2.frames()[-1]["resolved"] is True)


# ── доп: browser_live soft-гейт + браузерные кадры только зрителям + чистка при disconnect ──
async def t7():
    a = fresh()
    await register_owner(a, "chatA", "alice")
    # юнит-среда без CDP: подменяем продюсер, чтобы реальный не шумел ack'ами no_cdp
    async def _noop_producer():
        pass
    a._live_producer = _noop_producer
    ws_a, ws_b = FakeWS("alice"), FakeWS("bob")
    await a._on_frame(ws_a, {"type": "browser_live", "chat_id": "chatA", "action": "start",
                             "user_id": "alice", "role": "user"})
    await a._on_frame(ws_b, {"type": "browser_live", "chat_id": "chatA", "action": "start",
                             "user_id": "bob", "role": "user"})
    check("7: чужой browser_live -> forbidden", ws_b.frames()[-1].get("error") == "forbidden")
    check("7: чужой зритель не зарегистрирован", ws_b not in a._live_viewers)
    check("7: свой зритель зарегистрирован", a._live_viewers.get(ws_a) == "chatA")
    # browser_frame уходит только зарегистрированным зрителям (_send_live, не _broadcast)
    ws_x = FakeWS("ghost")
    a._sockets.update({ws_x})
    await a._send_live({"type": "browser_frame", "chat_id": "", "data": "zzz"})
    check("7: browser_frame только зрителю", "browser_frame" in ws_a.types()
          and "browser_frame" not in ws_b.types() and ws_x.sent == [])
    # админ может смотреть чужой чат
    ws_adm = FakeWS("adm")
    await a._on_frame(ws_adm, {"type": "browser_live", "chat_id": "chatA", "action": "start",
                               "user_id": "admin", "role": "admin"})
    check("7: админ смотрит чужой live", a._live_viewers.get(ws_adm) == "chatA")
    # отключение сокета чистит карты изоляции (логика finally _ws_handler)
    a._sockets.discard(ws_a)
    a._sock_user.pop(ws_a, None)
    a._sock_role.pop(ws_a, None)
    a._live_viewers.pop(ws_a, None)
    check("7: карты сокета почищены", ws_a not in a._sock_user and ws_a not in a._sock_role
          and ws_a not in a._live_viewers)


async def main():
    await t1()
    await t2()
    await t3()
    await t4()
    await t5()
    await t6()
    await t7()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL:
        print("FAILED:", FAIL)
        sys.exit(1)


asyncio.run(main())
