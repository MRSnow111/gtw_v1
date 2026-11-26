#!/usr/bin/env python3
"""Host-сторона CDP-моста для GTW live-браузера (systemd-служба, root).

Браузер агента (bot-desktop Chromium) живёт в sandbox-контейнере и слушает CDP
на контейнерном 127.0.0.1:<случ.порт>. Gateway-продюсер на хосте должен видеть
стабильный адрес. Этот демон:
  1) слушает 127.0.0.1:9333 на ХОСТЕ (продюсер: GTW_BROWSER_CDP_HOST=127.0.0.1,
     GTW_BROWSER_DEBUG_PORT=9333);
  2) сам находит контейнер с запущенным bot-desktop Chromium (имя/IP могут
     меняться при пересоздании sandbox);
  3) держит в нём мост cdp_bridge.py (0.0.0.0:9333 -> CDP Chromium), доставляя
     скрипт из host-mount при необходимости;
  4) пробрасывает каждое соединение хост:9333 -> контейнер:9333.

Устойчив к рестарту gateway и пересозданию контейнера: контейнер ищется заново.
"""
import asyncio
import json
import os
import subprocess
import time
import urllib.request

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 9333
# host-mount контейнерного /root (default sandbox home) — источник скрипта моста
BRIDGE_SRC = "/home/hermes/.hermes/sandboxes/docker/default/home/cdp_bridge.py"
CACHE_TTL = 8.0
_cache = {"ts": 0.0, "cid": None, "ip": None}


def _run(args, timeout=15):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def _probe(ip):
    """Живой ли CDP за мостом контейнера (есть браузерный ws-эндпоинт)."""
    try:
        with urllib.request.urlopen(f"http://{ip}:{LISTEN_PORT}/json/version", timeout=3) as r:
            return bool(json.load(r).get("webSocketDebuggerUrl"))
    except Exception:
        return False


def find_container():
    """Контейнер с ЖИВЫМ bot-desktop Chromium (CDP отвечает) + его IP.

    Контейнеров с bot-desktop процессом может быть несколько (старые sandbox);
    берём тот, где мост реально отдаёт CDP, а не первый попавшийся."""
    now = time.time()
    if now - _cache["ts"] < CACHE_TTL and _cache["ip"]:
        return _cache["cid"], _cache["ip"]
    cid = ip = None
    try:
        ids = _run(["docker", "ps", "-q"], timeout=10).stdout.split()
        for c in ids:
            # [p] в паттерне — чтобы pgrep -f не матчил cmdline самой bash-обёртки
            # проверки (иначе probe всегда "yes" в любом контейнере).
            probe = _run(["docker", "exec", c, "bash", "-lc",
                          "pgrep -f bot-desktop/browser-[p]rofile >/dev/null 2>&1 && echo yes"], timeout=10)
            if probe.stdout.strip() != "yes":
                continue
            got = _run(["docker", "inspect", "-f",
                        "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", c], timeout=10).stdout.strip()
            if not got:
                continue
            ensure_bridge(c)
            if _probe(got):
                cid, ip = c, got
                break
    except Exception:
        pass
    _cache.update(ts=now, cid=cid, ip=ip)
    return cid, ip


def ensure_bridge(cid):
    """Доставить скрипт моста в контейнер и запустить, если не жив."""
    try:
        # [b] — защита от self-match cmdline bash-обёртки: без неё alive всегда
        # "yes", мост никогда не запускается в пересозданном контейнере.
        alive = _run(["docker", "exec", cid, "bash", "-lc",
                      "pgrep -f cdp_[b]ridge.py >/dev/null 2>&1 && echo yes"], timeout=10)
        if alive.stdout.strip() == "yes":
            return
        if os.path.isfile(BRIDGE_SRC):
            _run(["docker", "cp", BRIDGE_SRC, f"{cid}:/root/cdp_bridge.py"], timeout=15)
        _run(["docker", "exec", "-d", cid, "bash", "-lc",
              "nohup python3 /root/cdp_bridge.py >> /root/cdp_bridge.log 2>&1 &"], timeout=15)
        time.sleep(0.6)
    except Exception:
        pass


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


async def handle(cr, cw):
    cid, ip = await asyncio.to_thread(find_container)
    if not ip:
        print("[host-bridge] контейнер с браузером агента не найден", flush=True)
        cw.close()
        return
    await asyncio.to_thread(ensure_bridge, cid)
    try:
        ur, uw = await asyncio.open_connection(ip, LISTEN_PORT)
    except Exception as e:
        print(f"[host-bridge] контейнер {ip}:{LISTEN_PORT} недоступен: {e}", flush=True)
        cw.close()
        return
    await asyncio.gather(pipe(cr, uw), pipe(ur, cw))


async def main():
    server = await asyncio.start_server(handle, LISTEN_HOST, LISTEN_PORT)
    print(f"[host-bridge] listen {LISTEN_HOST}:{LISTEN_PORT} -> agent browser container", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())