#!/usr/bin/env python3
"""GTW-пробник — локальная end-to-end проверка плагина GTW на хосте Hermes.

Проверяет: /health -> WS-авторизация -> hello -> реальное сообщение агенту -> ответ.
Токен читается из ~/.hermes/.env (или переменной GTW_TOKEN) и НИКОГДА не печатается.

Запуск (на хосте, где работает gateway):
  python3 probe.py
  python3 probe.py --port 8765 --timeout 240 --chat gtw-probe --text "..."

Внимание: пробник отправляет агенту НАСТОЯЩЕЕ сообщение (сессия gtw-probe)
и расходует токены модели. Approval-запросы пробник отклоняет (deny).
"""
import argparse
import asyncio
import os
import pathlib
import re
import sys
import uuid

# Tool-progress уведомления (💻 Running …, 🔧 …) приходят как message-кадры во время
# хода — это НЕ финальный ответ. Не запускаем по ним таймер тишины, иначе пробник
# обрывает ход на паузе между инструментами и не видит финал/артефакты.
_TOOL_PROGRESS = re.compile(
    r"^\s*(?:💻|🔧|🛠|📁|📂|🌐|🔍|🔎|📄|📝|⚙|🖥|📦|🧰|🗑|✏|📋|🧪|🚀|💾|📥|📤|🔨|📡)\uFE0F?\s"
)


def _is_tool_progress(content: str) -> bool:
    return bool(_TOOL_PROGRESS.match(content or ""))


def read_token() -> str:
    tok = os.environ.get("GTW_TOKEN", "").strip()
    if tok:
        return tok
    home = pathlib.Path(os.environ.get("HERMES_HOME") or (pathlib.Path.home() / ".hermes"))
    env = home / ".env"
    if env.is_file():
        for line in env.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line.startswith("GTW_TOKEN="):
                return line.split("=", 1)[1].strip().strip("'\"")
    return ""


async def run(args) -> int:
    try:
        import aiohttp
    except ImportError:
        print("ОШИБКА: в этом python нет aiohttp.")
        print("Запустите пробник питоном Hermes, например:")
        print("  ~/.hermes/tools/python-*/bin/python3 probe.py")
        print("или установите: python3 -m pip install aiohttp")
        return 2

    token = read_token()
    if not token:
        print("ОШИБКА: GTW_TOKEN не найден ни в окружении, ни в ~/.hermes/.env")
        return 2

    base = f"http://{args.host}:{args.port}"
    print(f"GTW-пробник -> {base}")

    async with aiohttp.ClientSession() as sess:
        # 1. health
        try:
            async with sess.get(base + "/health",
                                timeout=aiohttp.ClientTimeout(total=5)) as r:
                body = (await r.text()).strip()
                if r.status != 200:
                    print(f"ОШИБКА: /health вернул {r.status}: {body[:200]}")
                    return 1
                print(f"[1/4] /health: {body}")
        except Exception as e:
            print(f"ОШИБКА: /health недоступен ({e.__class__.__name__}: {e}).")
            print("Похоже, GTW не слушает. На хосте выполните:")
            print("  hermes -p default gateway restart")
            print("  journalctl --user -u hermes-gateway -n 100 --no-pager | grep -i gtw")
            return 1

        # 2. WS + hello
        try:
            ws = await sess.ws_connect(base + "/ws", headers={"X-GTW-Token": token})
        except aiohttp.WSServerHandshakeError as e:
            if e.status == 401:
                print("ОШИБКА: 401 — токен из ~/.hermes/.env не совпадает с токеном,")
                print("который видит gateway. Перезапустите: hermes -p default gateway restart")
            else:
                print(f"ОШИБКА: WS-рукопожатие вернуло {e.status}")
            return 1
        except Exception as e:
            print(f"ОШИБКА: не удалось открыть WS ({e.__class__.__name__}: {e})")
            return 1

        async with ws:
            try:
                hello = await asyncio.wait_for(ws.receive_json(), 10)
            except Exception as e:
                print(f"ОШИБКА: hello не получен ({e})")
                return 1
            if hello.get("type") != "hello":
                print(f"ОШИБКА: первый кадр не hello: {hello}")
                return 1
            print("[2/4] WS подключён, hello получен")

            # 3. реальное сообщение агенту
            mid = uuid.uuid4().hex
            await ws.send_json({"type": "user_message", "chat_id": args.chat,
                                "text": args.text, "message_id": mid,
                                "user_id": "gtw-probe", "user_name": "GTW Probe"})
            print(f"[3/4] отправлено агенту (chat={args.chat}): {args.text!r}")
            print(f"      жду ответ (таймаут {args.timeout}с)...")

            loop = asyncio.get_event_loop()
            deadline = loop.time() + args.timeout
            finals: list[str] = []
            last_final = None
            n_typing = n_draft = n_edit = n_progress = n_artifact = 0
            artifacts: list[dict] = []
            while True:
                now = loop.time()
                if now > deadline:
                    print(f"ОШИБКА: таймаут {args.timeout}с — финальный ответ не пришёл.")
                    print("Смотрите лог: journalctl --user -u hermes-gateway -n 100 --no-pager")
                    return 1
                if last_final is not None and now - last_final > 10:
                    break  # 10с тишины после финала/артефакта — ход завершён
                wait = 1.0 if last_final is not None else min(deadline - now, 30.0)
                try:
                    frame = await asyncio.wait_for(ws.receive_json(), wait)
                except asyncio.TimeoutError:
                    continue
                except Exception as e:
                    print(f"ОШИБКА: чтение WS оборвалось ({e})")
                    return 1
                t = frame.get("type")
                if t == "typing":
                    n_typing += 1
                elif t == "draft":
                    n_draft += 1
                elif t == "message_edit":
                    n_edit += 1
                    if frame.get("finalize"):
                        content = str(frame.get("content", ""))
                        if _is_tool_progress(content):
                            n_progress += 1
                        else:
                            finals.append(content)
                            last_final = loop.time()
                elif t == "message":
                    content = str(frame.get("content", ""))
                    if _is_tool_progress(content):
                        n_progress += 1  # tool-прогресс: не финал, не запускаем таймер
                    else:
                        finals.append(content)
                        last_final = loop.time()
                elif t == "approval_request":
                    print("  ! агент запросил approval — пробник отклоняет (deny):")
                    print(f"    команда: {frame.get('command')}")
                    await ws.send_json({"type": "approval_response",
                                        "request_id": frame.get("request_id"),
                                        "choice": "deny", "user_id": "gtw-probe"})
                elif t == "clarify_request":
                    choices = frame.get("choices") or []
                    resp = choices[0] if choices else "продолжай"
                    print(f"  ! clarify-вопрос агента: {frame.get('question')!r}")
                    print(f"    пробник отвечает: {resp!r}")
                    await ws.send_json({"type": "clarify_response",
                                        "clarify_id": frame.get("clarify_id"),
                                        "response": resp})
                elif t == "artifact":
                    n_artifact += 1
                    artifacts.append(frame)
                    print(f"  артефакт: {frame.get('kind')} {frame.get('name')} mime={frame.get('mime')} url={frame.get('url')}")
                    last_final = loop.time()  # ждём ещё 10с — вдруг будут ещё кадры
                elif t == "error":
                    print(f"  ошибка адаптера: {frame.get('error')}")

            if not finals and not artifacts:
                print("ОШИБКА: ход завершился без финального сообщения и без артефактов.")
                return 1
            if finals:
                print(f"[4/4] ответ агента:\n{'-' * 60}\n{finals[-1]}\n{'-' * 60}")
            print(f"статистика хода: typing={n_typing}, draft={n_draft}, edit={n_edit}, tool-прогресс={n_progress}, артефактов={n_artifact}")
            if artifacts:
                print(f"АРТЕФАКТЫ ДОСТАВЛЕНЫ ({n_artifact}): " + "; ".join(f"{a.get('kind')}:{a.get('name')}" for a in artifacts))
            else:
                print("артефактов нет (агент не отдал файл через MEDIA)")

            # бонус: история чата
            await ws.send_json({"type": "history", "chat_id": args.chat})
            try:
                while True:
                    h = await asyncio.wait_for(ws.receive_json(), 5)
                    if h.get("type") == "history":
                        print(f"история чата '{args.chat}': {len(h.get('items', []))} сообщений")
                        break
            except Exception:
                pass
    print("OK: GTW работает end-to-end (health -> WS -> агент -> ответ).")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="GTW local end-to-end probe")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--chat", default="gtw-probe")
    p.add_argument("--timeout", type=int, default=240)
    p.add_argument("--text", default="Это тестовое сообщение от GTW-пробника. Ответь одним словом: pong")
    args = p.parse_args()
    try:
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        print("прервано")
        return 130


if __name__ == "__main__":
    sys.exit(main())
