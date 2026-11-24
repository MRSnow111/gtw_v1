#!/usr/bin/env python3
"""CDP-мост: пробрасывает CDP браузерного агента из sandbox-контейнера на хост.

Браузер агента (bot-desktop Chromium) слушает CDP на 127.0.0.1:<случайный порт>
ВНУТРИ контейнера — с хоста (где живёт gateway-продюсер) он недоступен. Мост
слушает 0.0.0.0:<фикс.порт> в контейнере и на КАЖДОЕ подключение заново читает
актуальный порт Chromium из DevToolsActivePort (порт случайный и меняется при
перезапуске браузера) — поэтому переживает смену порта без рестарта.

Продюсер на хосте подключается к <IP-контейнера>:<фикс.порт> через
GTW_BROWSER_CDP_HOST + GTW_BROWSER_DEBUG_PORT.

Запуск (в контейнере):
  nohup python3 cdp_bridge.py > /root/cdp_bridge.log 2>&1 &
Env:
  GTW_BRIDGE_LISTEN_PORT  (по умолчанию 9333)
  GTW_BRIDGE_PROFILE      (по умолчанию /home/pn/.hermes/bot-desktop/browser-profile)
"""
import asyncio
import os
import sys

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = int(os.environ.get("GTW_BRIDGE_LISTEN_PORT", "9333"))
PROFILE = os.environ.get(
    "GTW_BRIDGE_PROFILE", "/home/pn/.hermes/bot-desktop/browser-profile"
)
DEVTOOLS = os.path.join(PROFILE, "DevToolsActivePort")


def current_port():
    try:
        with open(DEVTOOLS) as f:
            return int(f.readline().strip())
    except Exception:
        return None


async def pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except Exception:
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def handle(client_reader, client_writer):
    port = current_port()
    peer = client_writer.get_extra_info("peername")
    if not port:
        print(f"[bridge] {peer}: браузер не запущен (нет {DEVTOOLS})", flush=True)
        client_writer.close()
        return
    try:
        up_reader, up_writer = await asyncio.open_connection("127.0.0.1", port)
    except Exception as e:
        print(f"[bridge] {peer}: upstream 127.0.0.1:{port} недоступен: {e}", flush=True)
        client_writer.close()
        return
    print(f"[bridge] {peer} -> 127.0.0.1:{port}", flush=True)
    await asyncio.gather(
        pipe(client_reader, up_writer), pipe(up_reader, client_writer)
    )


async def main():
    server = await asyncio.start_server(handle, LISTEN_HOST, LISTEN_PORT)
    print(
        f"[bridge] CDP bridge {LISTEN_HOST}:{LISTEN_PORT} -> bot-desktop chromium "
        f"(profile={PROFILE})",
        flush=True,
    )
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)