"""GTW (Gateway To Hermes) platform adapter — web chat over a local WebSocket server.

Topology: browser -> GTW Next.js (httpOnly-cookie auth) -> WSS proxied with
GTW_TOKEN attached server-side -> this adapter inside the Hermes gateway -> agent.

config.yaml ``gateway.platforms.gtw.extra`` keys: token, port (8765), bind (127.0.0.1).
Env overrides: GTW_TOKEN, GTW_PORT, GTW_BIND.

WS protocol (JSON frames):
  client -> server:
    {type:"user_message", chat_id, text, message_id?, user_id?, user_name?}
    {type:"approval_response", request_id, choice}          # once|session|always|deny
    {type:"clarify_response", clarify_id, response}
    {type:"stop", chat_id}
    {type:"history", chat_id}
    {type:"session_info", chat_id}                          # статистика сессии (модель/токены/скорость)
    {type:"sessions"}                                       # админ: все отслеживаемые чаты
    {type:"models", chat_id}                                # админ: каталог моделей
    {type:"set_model", chat_id, model}                      # админ: переключить модель (/model)
  server -> client:
    {type:"hello"}
    {type:"message", chat_id, message_id, content, metadata?}
    {type:"draft", chat_id, draft_id, content, mode?}        # streaming preview
    {type:"message_edit", chat_id, message_id, content, finalize}
    {type:"typing", chat_id}
    {type:"status", chat_id, status_key?, content, metadata?}  # tool-progress / thinking / служебные
    {type:"approval_request", chat_id, request_id, command, description, text, actions:[{label,choice,style}]}
    {type:"clarify_request", chat_id, clarify_id, question, choices, multi_select}
    {type:"artifact", chat_id, kind, url, caption?}
    {type:"history", chat_id, items:[{role, content, ts, message_id}]}
    {type:"session_info", info:{...}}                       # ответ только запрашивающему сокету
    {type:"sessions", items:[{...}]}
    {type:"models", chat_id, current:{model,provider}, providers:[{name,models}]}
    {type:"set_model_ack", chat_id, model, ok}
    {type:"error", error}

Статистика: модель/провайдер — публичный seam get_session_model_settings(source);
токены — счётчики агента из кэша gateway (feature-detect, деградация до оценки
по объёму стрима). Кадры session_info/sessions/models/set_model_ack отправляются
только запрашивающему сокету (unicast), остальные — broadcast.
"""

import asyncio
import contextlib
import datetime
import json
import logging
import mimetypes
import os
import re
import shutil
import threading
import uuid
from collections import deque
from pathlib import Path
from typing import Any, Optional

from gateway.config import Platform
from gateway.platforms._shared import coerce_port, extra_or_secret
from gateway.platforms.base import BasePlatformAdapter
from gateway.platforms.event import MessageEvent, MessageType
from gateway.platforms.helpers import MessageDeduplicator

from ._util import _ms_id
from .isolation import IsolationMixin
from .live_browser import LiveBrowserMixin
from .models import ModelsMixin
from .outbound import OutboundMixin
from .projects import ProjectsMixin
from .stats import StatsMixin


logger = logging.getLogger(__name__)

# Лимиты ядра (C3: были литералами в теле методов).
_HISTORY_LIMIT = 500                   # сообщений истории чата (deque maxlen)
WS_HEARTBEAT_S = 30.0                  # heartbeat WS клиента
WS_MAX_MSG_SIZE = 4 * 1024 * 1024      # потолок входящего кадра (4 МБ)
ENSURE_ROUTED_TIMEOUT_S = 60           # ждём провизион профиля до диспатча хода
ATTACHMENTS_MAX = 10                   # вложений за один ход
ATTACH_CHAT_SLUG_MAX = 80              # длина sanitizированного chat_id в кэше
ATTACH_ID_MAX = 64                     # длина fileId в пути кэша
ATTACH_FILE_NAME_MAX = 120             # длина имени файла-вложения


class GTWAdapter(IsolationMixin, ProjectsMixin, StatsMixin, LiveBrowserMixin,
                 ModelsMixin, OutboundMixin, BasePlatformAdapter):
    """WebSocket bridge between the GTW web frontend and the Hermes gateway.

    Доменные методы вынесены в миксины пакета (волна 5, C1): изоляция
    профилей, проекты, статистика, live-браузер, каталог моделей, исходящие
    кадры. Здесь — lifecycle, WS-обвязка, dispatch и inbound.
"""

    def __init__(self, config):
        super().__init__(config, Platform("gtw"))
        self.token = extra_or_secret(config.extra, "token", "GTW_TOKEN")
        self.port = int(coerce_port(extra_or_secret(config.extra, "port", "GTW_PORT"), 8765))
        self.bind = str(extra_or_secret(config.extra, "bind", "GTW_BIND") or "127.0.0.1")
        self._sockets: set = set()
        self._runner = None
        self._site = None
        self._dedup = MessageDeduplicator()
        self._history: dict[str, deque] = {}
        self._approval_sessions: dict[str, str] = {}  # request_id -> session_key
        self._chat_stats: dict[str, dict] = {}  # chat_id -> статистика сессии
        # ── S1 изоляция: владельцы чатов/сокетов (defense-in-depth, слой 2) ──
        self._chat_owner: dict[str, str] = {}       # chat_id -> user_id (из user_message)
        self._sock_user: dict[Any, str] = {}        # ws -> user_id (кадры server.js, login из куки)
        self._sock_role: dict[Any, str] = {}        # ws -> role ("admin"/"user", из server.js)
        self._approval_owner: dict[str, str] = {}   # request_id -> user_id (владелец чата)
        self._clarify_owner: dict[str, str] = {}    # clarify_id -> user_id (владелец чата)
        # ── изоляция пользователей по профилям Hermes (multiplex) ──
        self._served_cache: set = set()          # имена профилей, уже обслуживаемых шлюзом
        self._routed_cache: set = set()          # имена профилей с уже инжектированным маршрутом
        self._admin_logins: set = set()          # логины с ролью admin — не изолируются (default)
        self._prov_locks: dict = {}              # name -> threading.Lock (провизион)
        self._prov_guard = threading.Lock()
        self._persist_lock = threading.Lock()
        self._multiplex_cache: Optional[bool] = None
        # ── live-просмотр браузера агента (CDP screencast) ──
        self._live_viewers: dict = {}   # ws -> chat_id (кто смотрит live)
        self._live_task = None          # asyncio.Task продюсера кадров

    @property
    def name(self) -> str:
        return "GTW"

    async def connect(self, *, is_reconnect: bool = False) -> bool:
        if not self.token:
            logger.error("GTW: GTW_TOKEN must be configured")
            self._set_fatal_error("config_missing", "GTW_TOKEN must be set", retryable=False)
            return False
        try:
            from aiohttp import web
        except ImportError:
            logger.error("GTW: aiohttp is required (ships with Hermes)")
            self._set_fatal_error("deps_missing", "aiohttp not importable", retryable=False)
            return False

        app = web.Application()
        app.router.add_get("/ws", self._ws_handler)
        app.router.add_get("/health", lambda _r: web.json_response({"ok": True}))
        self._runner = web.AppRunner(app, access_log=None)
        try:
            await self._runner.setup()
            self._site = web.TCPSite(self._runner, self.bind, self.port)
            await self._site.start()
        except Exception as e:
            logger.error("GTW: failed to bind %s:%s — %s", self.bind, self.port, e)
            await self._teardown_server()
            self._set_fatal_error("bind_failed", str(e), retryable=True)
            return False
        self._mark_connected()
        logger.info("GTW: WebSocket server listening on %s:%s", self.bind, self.port)
        self._wire_plugin_handlers(None)
        return True

    async def disconnect(self) -> None:
        self._mark_disconnected()
        for ws in list(self._sockets):
            with contextlib.suppress(Exception):
                await ws.close()
        self._sockets.clear()
        await self._teardown_server()

    async def _teardown_server(self) -> None:
        if self._runner is not None:
            with contextlib.suppress(Exception):
                await self._runner.cleanup()
        self._runner = None
        self._site = None

    async def _broadcast(self, payload: dict[str, Any]) -> int:
        """Send a JSON frame to every authenticated socket; returns delivery count.

        S1 (слой 2, defense-in-depth): приватные кадры — кадры с chat_id, у которого
        известен владелец (_chat_owner из user_message) — доставляются только
        владельцу и админам. Неизвестный сокет (ни одного кадра с user_id) чужие
        приватные кадры не получает. Кадры без chat_id или без известного владельца
        идут всем (системные/legacy-потоки).
        """

        if not self._sockets:
            return 0
        data = json.dumps(payload, ensure_ascii=False, default=str)
        owner = self._chat_owner.get(str(payload.get("chat_id") or ""))
        delivered = 0
        for ws in list(self._sockets):
            if owner:
                su = self._sock_user.get(ws)
                if self._sock_role.get(ws) == "admin":
                    pass  # админ получает всё
                elif su is None:
                    continue  # неизвестный сокет не получает чужие приватные кадры
                elif su != owner:
                    continue
            try:
                await ws.send_str(data)
                delivered += 1
            except Exception:
                self._sockets.discard(ws)
        return delivered

    def _foreign_frame(self, ws, chat_id: str, frame: dict[str, Any]) -> bool:
        """S1: True — запрос относится к чужому приватному чату (soft-гейт).

        Владелец чата известен, user_id запроса задан и не совпадает с владельцем,
        роль не admin. Кадры без user_id (бенч/старые клиенты -> "gtw") и чаты без
        известного владельца не считаются чужими — legacy-потоки не ломаются.
        """
        owner = self._chat_owner.get(str(chat_id or ""))
        if not owner:
            return False
        uid = frame.get("user_id")
        if not uid or str(uid) == owner:
            return False
        return self._sock_role.get(ws) != "admin" and str(frame.get("role") or "") != "admin"

    def _remember(self, chat_id: str, role: str, content: str, message_id: str) -> None:
        items = self._history.setdefault(chat_id, deque(maxlen=_HISTORY_LIMIT))
        items.append({
            "role": role,
            "content": content,
            "ts": datetime.datetime.now().isoformat(timespec="seconds"),
            "message_id": message_id,
        })

    async def _ws_handler(self, request):
        from aiohttp import WSMsgType, web

        token = request.headers.get("X-GTW-Token") or request.query.get("token", "")
        if not self.token or token != self.token:
            return web.Response(status=401, text="unauthorized")
        ws = web.WebSocketResponse(heartbeat=WS_HEARTBEAT_S, max_msg_size=WS_MAX_MSG_SIZE)
        await ws.prepare(request)
        self._sockets.add(ws)
        logger.info("GTW: client connected (%d total)", len(self._sockets))
        try:
            await ws.send_json({"type": "hello"})
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    try:
                        await self._on_frame(ws, msg.json())
                    except Exception as e:
                        logger.warning("GTW: bad frame: %s", e)
                        with contextlib.suppress(Exception):
                            await ws.send_json({"type": "error", "error": "bad_frame"})
                elif msg.type in (WSMsgType.ERROR, WSMsgType.CLOSE):
                    break
        finally:
            self._sockets.discard(ws)
            # S1: чистим карты изоляции этого сокета
            self._sock_user.pop(ws, None)
            self._sock_role.pop(ws, None)
            self._live_viewers.pop(ws, None)
            if not self._live_viewers and self._live_task and not self._live_task.done():
                self._live_task.cancel()
            logger.info("GTW: client disconnected (%d left)", len(self._sockets))
        return ws

    async def _on_frame(self, ws, frame: dict[str, Any]) -> None:
        kind = frame.get("type")
        # S1: регистрируем пользователя/роль сокета (server.js инжектит login из куки).
        if frame.get("user_id"):
            self._sock_user[ws] = str(frame["user_id"])
        if frame.get("role"):
            self._sock_role[ws] = str(frame["role"])
        if kind == "user_message":
            await self._inbound_message(frame)
        elif kind == "approval_response":
            await self._resolve_approval(frame)
        elif kind == "clarify_response":
            from tools.clarify_gateway import resolve_gateway_clarify
            # S1: чужую clarify-карточку не резолвим (владелец известен, user_id другой).
            cid = str(frame.get("clarify_id") or "")
            cowner = self._clarify_owner.get(cid)
            quid = str(frame.get("user_id") or "gtw")
            if cowner and quid != "gtw" and quid != cowner and self._sock_role.get(ws) != "admin":
                ok = False
            else:
                ok = resolve_gateway_clarify(cid, str(frame.get("response", "")))
            await ws.send_json({"type": "clarify_ack", "clarify_id": frame.get("clarify_id"), "resolved": ok})
        elif kind == "stop":
            chat_id = str(frame.get("chat_id") or "main")
            source = self._source_for(chat_id, str(frame.get("user_id") or "gtw"))
            await self.handle_message(MessageEvent(
                text="/stop", message_type=MessageType.COMMAND, source=source,
                message_id=_ms_id(), timestamp=datetime.datetime.now()))
        elif kind == "history":
            chat_id = str(frame.get("chat_id") or "main")
            # S1: чужую историю не отдаём (свой сокет получает items как раньше).
            if self._foreign_frame(ws, chat_id, frame):
                await ws.send_json({"type": "error", "error": "forbidden", "chat_id": chat_id})
            else:
                await ws.send_json({"type": "history", "chat_id": chat_id,
                                    "items": list(self._history.get(chat_id, []))})
        elif kind == "session_info":
            chat_id = str(frame.get("chat_id") or "main")
            # S1: чужую статистику сессии не отдаём.
            if self._foreign_frame(ws, chat_id, frame):
                await ws.send_json({"type": "error", "error": "forbidden", "chat_id": chat_id})
            else:
                await ws.send_json({"type": "session_info", "info": self._build_session_info(chat_id)})
        elif kind == "sessions":
            items = [self._build_session_info(cid) for cid in list(self._chat_stats)]
            items.sort(key=lambda x: x.get("lastActivity") or "", reverse=True)
            await ws.send_json({"type": "sessions", "items": items})
        elif kind == "models":
            await self._send_models(ws, frame)
        elif kind == "set_model":
            await self._set_model(ws, frame)
        elif kind == "browser_live":
            await self._browser_live(ws, frame)
        else:
            await ws.send_json({"type": "error", "error": f"unknown_type:{kind}"})

    def _source_for(self, chat_id: str, user_id: str = "gtw", user_name: str = "GTW"):
        return self.build_source(chat_id=chat_id, chat_name=chat_id, chat_type="dm",
                                 user_id=user_id, user_name=user_name)

    async def _inbound_message(self, frame: dict[str, Any]) -> None:
        text = str(frame.get("text") or "").strip()
        chat_id = str(frame.get("chat_id") or "main")
        attachments = frame.get("attachments") or []
        if not isinstance(attachments, list):
            attachments = []
        if not text and not attachments:
            return
        message_id = str(frame.get("message_id") or _ms_id())
        if self._dedup.is_duplicate(message_id):
            return
        user_id = str(frame.get("user_id") or "gtw")
        user_name = str(frame.get("user_name") or user_id)
        role = str(frame.get("role") or "user")  # роль из подписанной куки (server.js)
        # S1: фиксируем владельца чата по первому user_message (источник для _broadcast).
        if user_id and user_id != "gtw":
            self._chat_owner[chat_id] = user_id
        elif chat_id not in self._chat_owner:
            self._chat_owner[chat_id] = "gtw"  # legacy: кадр без user_id (бенч/старый клиент)
        st = self._stats(chat_id)
        st["user_id"] = user_id
        st["user_name"] = user_name
        st["role"] = role
        if user_id != "gtw":
            if role == "admin":
                self._admin_logins.add(user_id)
            else:
                self._admin_logins.discard(user_id)
        st["turns"] += 1
        self._touch(chat_id)
        self._remember(chat_id, "user", text or "(вложение)", message_id)
        # Вложения -> кэш launch-home (нативная конвенция ядра: media_urls = host-путь;
        # ядро само переносит в cache профиля и делает agent-visible). До роутинга.
        media_urls: list[str] = []
        media_types: list[str] = []
        media_filenames: list[str] = []
        if attachments:
            try:
                from hermes_constants import get_hermes_home
                safe_chat = re.sub(r"[^\w.\-]", "_", chat_id)[:ATTACH_CHAT_SLUG_MAX] or "chat"
                cache_root = Path(get_hermes_home()) / "cache" / "gtw" / safe_chat
                for att in attachments[:ATTACHMENTS_MAX]:
                    if not isinstance(att, dict):
                        continue
                    src = str(att.get("storage_path") or "")
                    name = str(att.get("name") or "file")
                    if not src or not os.path.isfile(src):
                        continue
                    fid = re.sub(r"[^\w.\-]", "_", str(att.get("fileId") or uuid.uuid4().hex))[:ATTACH_ID_MAX]
                    safe_name = re.sub(r"[^\w.\-]", "_", name)[:ATTACH_FILE_NAME_MAX] or "file"
                    dest_dir = cache_root / fid
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    dest = dest_dir / safe_name
                    shutil.copyfile(src, dest)
                    mime = str(att.get("mime") or mimetypes.guess_type(safe_name)[0] or "application/octet-stream")
                    media_urls.append(str(dest))
                    media_types.append(mime)
                    media_filenames.append(name)
            except Exception:
                logger.exception("GTW: attachment cache failed")
        # Изоляция: гарантировать профиль пользователя + маршрут до построения source.
        # Блокирующий провизион+инжекция маршрута — в отдельном потоке (цикл свободен).
        if user_id != "gtw" and self._multiplex_on():
            try:
                await asyncio.wait_for(
                    asyncio.to_thread(self._ensure_user_routed, user_id),
                    timeout=ENSURE_ROUTED_TIMEOUT_S)
            except Exception as e:
                logger.warning("GTW: ensure user routed for %s: %s", user_id, e)
        source = self.build_source(chat_id=chat_id, chat_name=chat_id, chat_type="dm",
                                   user_id=user_id, user_name=user_name)
        # Контекст проекта (фаза 3) — префикс к тексту агента, не к истории (_remember выше).
        try:
            proj_ctx = await asyncio.to_thread(self._project_context, frame, user_id, role)
        except Exception:
            proj_ctx = ""
        agent_text = proj_ctx + text
        await self.handle_message(MessageEvent(
            text=agent_text, message_type=MessageType.TEXT, source=source,
            user_id=user_id, user_name=user_name,
            message_id=message_id, timestamp=datetime.datetime.now(),
            media_urls=media_urls, media_types=media_types, media_filenames=media_filenames))

    async def _resolve_approval(self, frame: dict[str, Any]) -> None:
        from tools.approval import resolve_gateway_approval_card

        request_id = str(frame.get("request_id") or "")
        choice = str(frame.get("choice") or "deny")
        session_key = self._approval_sessions.get(request_id)
        if not session_key or choice not in ("once", "session", "always", "deny"):
            return
        # S1: чужую approval-карточку не резолвим (владелец известен, user_id другой).
        aowner = self._approval_owner.get(request_id)
        quid = str(frame.get("user_id") or "gtw")
        # Кадр approval_response не содержит chat_id — владельца сокета берём из frame.role,
        # который server.js инжектит из подписанной куки. Владелец "gtw" (неизвестен) не гейтится.
        if aowner and quid != "gtw" and quid != aowner and str(frame.get("role") or "") != "admin":
            await self._broadcast({"type": "approval_ack", "request_id": request_id,
                                   "choice": choice, "resolved": False})
            return
        resolved = resolve_gateway_approval_card(session_key, choice, request_id,
                                                 actor_id=str(frame.get("user_id") or "gtw"),
                                                 extra=self.config.extra)
        logger.info("GTW: approval %s choice=%s resolved=%d", request_id[:8], choice, resolved)
        await self._broadcast({"type": "approval_ack", "request_id": request_id,
                               "choice": choice, "resolved": resolved})


# ── plugin registration ───────────────────────────────────────────────────────
# Ре-экспорт: __init__.py на проде делает `from .adapter import register`, а
# registration.py не должен импортировать adapter.py (цикл) — класс передаётся
# в make_register() здесь, поэтому импорт стоит после определения класса.
from .registration import (  # noqa: E402
    check_requirements,
    is_connected,
    make_register,
    validate_config,
)

register = make_register(GTWAdapter)

__all__ = ["GTWAdapter", "register", "check_requirements", "validate_config",
           "is_connected"]
