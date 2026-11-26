"""GTW-плагин: live-просмотр браузера агента (CDP screencast).

Зрители (ws -> chat_id) и одиночный продюсер кадров: периодический
Page.captureScreenshot активной вкладки -> кадр browser_frame. Discovery
таргетов живёт в продюсере (мёртвый дубль _browser_cdp_url удалён в волне 3).
Перенос из adapter.py без изменения логики (волна 5, C1).
"""

import asyncio
import contextlib
import json
import logging
import os
import time
from pathlib import Path


logger = logging.getLogger(__name__)

# Параметры live-продюсера (C3: были литералами в теле _live_producer).
LIVE_TICK_INTERVAL_S = 0.35                # период съёма скриншота активной вкладки
LIVE_TICK_MIN_SLEEP_S = 0.05               # нижняя граница паузы между тиками
LIVE_MAX_FAILS = 12                        # подряд неудачных тиков -> cdp_disconnected
LIVE_HTTP_TIMEOUT_S = 5                    # запрос /json/list (discovery таргетов)
LIVE_SHOT_TIMEOUT_S = 5                    # ожидание ответа Page.captureScreenshot
LIVE_WS_HEARTBEAT_S = 30                   # heartbeat CDP-соединения
LIVE_WS_MAX_MSG_SIZE = 32 * 1024 * 1024    # jpeg-скриншот может быть большим
LIVE_SHOT_FORMAT = "jpeg"
LIVE_SHOT_QUALITY = 60


class LiveBrowserMixin:
    """Одиночный live-продюсер + рассылка кадров зрителям."""

    async def _send_live(self, payload: dict) -> None:
        """Кадр live только зарегистрированным зрителям (не всем сокетам)."""
        if not self._live_viewers:
            return
        data = json.dumps(payload, ensure_ascii=False)
        for ws in list(self._live_viewers):
            try:
                await ws.send_str(data)
            except Exception:
                self._live_viewers.pop(ws, None)

    async def _browser_live(self, ws, frame: dict) -> None:
        action = str(frame.get("action") or "start")
        chat_id = str(frame.get("chat_id") or "main")
        if action == "stop":
            self._live_viewers.pop(ws, None)
            with contextlib.suppress(Exception):
                await ws.send_json({"type": "browser_live_ack", "chat_id": chat_id, "active": False})
            if not self._live_viewers and self._live_task and not self._live_task.done():
                self._live_task.cancel()
            return
        self._live_viewers[ws] = chat_id
        # S1: soft-гейт — смотреть live чужого чата нельзя (админ может).
        # Регистрация зрителя уже произошла выше: кадры уходят только в _live_viewers,
        # поэтому на legacy-поток (кадр без user_id/role, владелец неизвестен) это не влияет.
        if frame.get("user_id") and not (
                self._sock_role.get(ws) == "admin" or str(frame.get("role") or "") == "admin"
                or str(frame["user_id"]) == self._chat_owner.get(chat_id)):
            self._live_viewers.pop(ws, None)
            with contextlib.suppress(Exception):
                await ws.send_json({"type": "error", "error": "forbidden", "chat_id": chat_id})
            if not self._live_viewers and self._live_task and not self._live_task.done():
                self._live_task.cancel()
            return
        if not self._live_task or self._live_task.done():
            self._live_task = asyncio.create_task(self._live_producer())
        with contextlib.suppress(Exception):
            await ws.send_json({"type": "browser_live_ack", "chat_id": chat_id, "active": True})

    async def _live_producer(self) -> None:
        """Периодический Page.captureScreenshot АКТИВНОЙ вкладки → browser_frame.

        Page.startScreencast шлёт кадр ТОЛЬКО при изменении страницы, поэтому
        статичная страница «замерзала» (картинка не обновлялась, fps показывал
        устаревшее среднее). Вместо этого опрашиваем скриншот с фиксированным
        интервалом: картинка всегда свежая, навигация видна сразу, fps реальный.
        Каждый тик берём ПЕРВЫЙ page-таргет /json/list — это активная вкладка
        (Target.activateTarget ставит её первой), поэтому следим за переключениями
        вкладок агентом. GTW_BROWSER_CDP (явный page-ws) — фиксированная вкладка.
        """
        import aiohttp
        from urllib.parse import urlsplit
        interval = LIVE_TICK_INTERVAL_S
        explicit = os.environ.get("GTW_BROWSER_CDP", "").strip()
        host = os.environ.get("GTW_BROWSER_CDP_HOST", "127.0.0.1").strip() or "127.0.0.1"
        port = os.environ.get("GTW_BROWSER_DEBUG_PORT", "").strip()
        if not port and not explicit:
            prof = os.environ.get("GTW_BROWSER_PROFILE", "").strip()
            if prof:
                try:
                    port = (Path(prof) / "DevToolsActivePort").read_text().splitlines()[0].strip()
                except Exception:
                    port = ""
        if not explicit and not port:
            logger.warning("GTW live: no CDP endpoint (set GTW_BROWSER_CDP / GTW_BROWSER_DEBUG_PORT)")
            await self._send_live({"type": "browser_live_ack", "chat_id": "", "active": False, "error": "no_cdp"})
            self._live_task = None
            return
        base = f"http://{host}:{port}" if port else ""
        msg_id = 0
        cur_id = None
        cur_ws = None
        cur_url = ""
        fails = 0

        async def shot(ws):
            nonlocal msg_id
            msg_id += 1
            mid = msg_id
            await ws.send_json({"id": mid, "method": "Page.captureScreenshot",
                                "params": {"format": LIVE_SHOT_FORMAT, "quality": LIVE_SHOT_QUALITY}})
            while True:
                m = await asyncio.wait_for(ws.receive(), timeout=LIVE_SHOT_TIMEOUT_S)
                if m.type != aiohttp.WSMsgType.TEXT:
                    continue
                f = m.json()
                if f.get("id") == mid:
                    return (f.get("result") or {}).get("data", "")

        try:
            async with aiohttp.ClientSession() as sess:
                while self._live_viewers:
                    t0 = time.time()
                    try:
                        if explicit:
                            if cur_ws is None or cur_ws.closed:
                                cur_ws = await sess.ws_connect(explicit, max_msg_size=LIVE_WS_MAX_MSG_SIZE, heartbeat=LIVE_WS_HEARTBEAT_S)
                                cur_id = "explicit"
                            tid = "explicit"
                        else:
                            async with sess.get(base + "/json/list", timeout=aiohttp.ClientTimeout(total=LIVE_HTTP_TIMEOUT_S)) as r:
                                targets = await r.json()
                            page = next((t for t in targets or []
                                         if t.get("type") == "page" and t.get("webSocketDebuggerUrl")), None)
                            if page is None:
                                await asyncio.sleep(interval)
                                continue
                            tid = page.get("id")
                            cur_url = str(page.get("url") or "")
                            if cur_id != tid or cur_ws is None or cur_ws.closed:
                                if cur_ws:
                                    with contextlib.suppress(Exception):
                                        await cur_ws.close()
                                pws = f"ws://{host}:{port}{urlsplit(str(page['webSocketDebuggerUrl'])).path}"
                                cur_ws = await sess.ws_connect(pws, max_msg_size=LIVE_WS_MAX_MSG_SIZE, heartbeat=LIVE_WS_HEARTBEAT_S)
                                cur_id = tid
                        data = await shot(cur_ws)
                        if data:
                            fails = 0
                            await self._send_live({"type": "browser_frame", "chat_id": "", "data": data,
                                                   "url": cur_url, "ts": int(time.time() * 1000)})
                        else:
                            fails += 1
                    except asyncio.CancelledError:
                        raise
                    except Exception as e:
                        fails += 1
                        logger.debug("GTW live tick: %s", e)
                        if cur_ws:
                            with contextlib.suppress(Exception):
                                await cur_ws.close()
                        cur_ws = None
                        cur_id = None
                    if fails >= LIVE_MAX_FAILS:
                        await self._send_live({"type": "browser_live_ack", "chat_id": "",
                                               "active": False, "error": "cdp_disconnected"})
                        break
                    await asyncio.sleep(max(LIVE_TICK_MIN_SLEEP_S, interval - (time.time() - t0)))
                if cur_ws:
                    with contextlib.suppress(Exception):
                        await cur_ws.close()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("GTW live producer error: %s", e)
            await self._send_live({"type": "browser_live_ack", "chat_id": "", "active": False, "error": "cdp_disconnected"})
        finally:
            self._live_task = None
            await self._send_live({"type": "browser_live_ack", "chat_id": "", "active": False})
