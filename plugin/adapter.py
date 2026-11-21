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
import dataclasses
import datetime
import logging
import time
import uuid
from collections import deque
from typing import Any, Optional

from gateway.platforms._shared import (
    coerce_port,
    extra_or_secret,
    get_scoped_secret as _get_scoped_secret,
    seed_extra_from_env as _seed_extra_from_env,
)
from gateway.platforms.base import BasePlatformAdapter, SendResult
from gateway.platforms.event import MessageEvent, MessageType
from gateway.platforms.helpers import MessageDeduplicator, cancel_task
from gateway.config import Platform

logger = logging.getLogger(__name__)

_HISTORY_LIMIT = 500


def _ms_id() -> str:
    return uuid.uuid4().hex


class GTWAdapter(BasePlatformAdapter):
    """WebSocket bridge between the GTW web frontend and the Hermes gateway."""

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

    # ── статистика сессий ────────────────────────────────────────────────────

    def _stats(self, chat_id: str) -> dict:
        st = self._chat_stats.get(chat_id)
        if st is None:
            st = {
                "user_id": "", "user_name": "", "turns": 0,
                "tools": 0, "tool_names": [], "last_activity": "",
                "turn_started": None, "last_turn_ms": None,
                "out_chars": 0, "tokens_base": None,
            }
            self._chat_stats[chat_id] = st
        return st

    def _touch(self, chat_id: str) -> None:
        self._stats(chat_id)["last_activity"] = datetime.datetime.now().isoformat(timespec="seconds")

    def _source_for(self, chat_id: str, user_id: str = "gtw", user_name: str = "GTW"):
        return self.build_source(chat_id=chat_id, chat_name=chat_id, chat_type="dm",
                                 user_id=user_id, user_name=user_name)

    def _session_settings(self, chat_id: str) -> dict:
        """Модель/провайдер/session_key через публичный seam ядра (feature-detect)."""
        fn = getattr(self, "get_session_model_settings", None)
        if not callable(fn):
            return {}
        st = self._stats(chat_id)
        try:
            settings = fn(self._source_for(chat_id, st["user_id"] or "gtw", st["user_name"] or "GTW"))
            return dict(settings) if settings else {}
        except Exception as e:
            logger.debug("GTW: session model settings unavailable: %s", e)
            return {}

    def _agent_usage(self, session_key: str) -> Optional[dict]:
        """Счётчики токенов живого агента из кэша gateway. Приватный API ядра —
        читаем defensively (getattr + lock), при недоступности возвращаем None."""
        if not session_key:
            return None
        runner = getattr(self, "gateway_runner", None)
        cache = getattr(runner, "_agent_cache", None)
        if cache is None:
            return None
        lock = getattr(runner, "_agent_cache_lock", None)
        try:
            with (lock or contextlib.suppress()):
                entry = cache.get(session_key)
        except Exception:
            return None
        agent = entry[0] if isinstance(entry, tuple) and entry else entry
        if agent is None or not hasattr(agent, "session_output_tokens"):
            return None  # включая pending-сентинел
        try:
            inp = int(getattr(agent, "session_input_tokens", 0) or 0)
            out = int(getattr(agent, "session_output_tokens", 0) or 0)
            total = int(getattr(agent, "session_total_tokens", 0) or 0) or (inp + out)
            usage = {
                "inTokens": inp, "outTokens": out, "totalTokens": total,
                "apiCalls": int(getattr(agent, "session_api_calls", 0) or 0),
            }
            cost = getattr(agent, "session_estimated_cost_usd", None)
            if cost:
                usage["costUsd"] = round(float(cost), 4)
            return usage
        except Exception:
            return None

    def _turn_start(self, chat_id: str) -> None:
        st = self._stats(chat_id)
        if st["turn_started"] is None:
            st["turn_started"] = time.monotonic()
            st["out_chars"] = 0
            settings = self._session_settings(chat_id)
            usage = self._agent_usage(str(settings.get("session_key") or ""))
            st["tokens_base"] = usage["outTokens"] if usage else None

    def _turn_end(self, chat_id: str) -> None:
        st = self._stats(chat_id)
        if st["turn_started"] is None:
            return
        st["last_turn_ms"] = int((time.monotonic() - st["turn_started"]) * 1000)
        st["turn_started"] = None

    def _build_session_info(self, chat_id: str) -> dict:
        st = self._stats(chat_id)
        settings = self._session_settings(chat_id)
        usage = self._agent_usage(str(settings.get("session_key") or ""))
        source = "agent" if usage else "unknown"
        if usage is None:
            usage = {"inTokens": 0, "outTokens": 0, "totalTokens": 0, "apiCalls": 0}
        # скорость: дельта токенов за ход; без счётчиков — оценка по объёму стрима
        tps = None
        cps = None
        ms = st["last_turn_ms"]
        if ms and ms > 0:
            if usage["outTokens"] and st["tokens_base"] is not None:
                delta = usage["outTokens"] - st["tokens_base"]
                if delta > 0:
                    tps = round(delta / (ms / 1000), 1)
                    source = "agent"
            if st["out_chars"] > 0:
                cps = round(st["out_chars"] / (ms / 1000), 1)
                if tps is None:
                    tps = round(cps / 4, 1)  # грубая оценка: ~4 символа на токен
                    if source == "unknown":
                        source = "estimate"
        return {
            "chat_id": chat_id,
            "user_id": st["user_id"], "user_name": st["user_name"],
            "model": str(settings.get("model") or ""),
            "provider": str(settings.get("provider") or ""),
            "session_key": str(settings.get("session_key") or ""),
            "usage": usage,
            "speed": {"tokensPerSec": tps, "charsPerSec": cps, "lastTurnMs": ms},
            "source": source,
            "tools": {"count": st["tools"], "names": st["tool_names"][-12:]},
            "turns": st["turns"],
            "lastActivity": st["last_activity"],
        }

    @property
    def name(self) -> str:
        return "GTW"

    # ── lifecycle ────────────────────────────────────────────────────────────

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

    # ── WebSocket plumbing ───────────────────────────────────────────────────

    async def _broadcast(self, payload: dict[str, Any]) -> int:
        """Send a JSON frame to every authenticated socket; returns delivery count."""
        import json

        if not self._sockets:
            return 0
        data = json.dumps(payload, ensure_ascii=False, default=str)
        delivered = 0
        for ws in list(self._sockets):
            try:
                await ws.send_str(data)
                delivered += 1
            except Exception:
                self._sockets.discard(ws)
        return delivered

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
        ws = web.WebSocketResponse(heartbeat=30.0, max_msg_size=4 * 1024 * 1024)
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
            logger.info("GTW: client disconnected (%d left)", len(self._sockets))
        return ws

    async def _on_frame(self, ws, frame: dict[str, Any]) -> None:
        kind = frame.get("type")
        if kind == "user_message":
            await self._inbound_message(frame)
        elif kind == "approval_response":
            await self._resolve_approval(frame)
        elif kind == "clarify_response":
            from tools.clarify_gateway import resolve_gateway_clarify
            ok = resolve_gateway_clarify(str(frame.get("clarify_id", "")), str(frame.get("response", "")))
            await ws.send_json({"type": "clarify_ack", "clarify_id": frame.get("clarify_id"), "resolved": ok})
        elif kind == "stop":
            chat_id = str(frame.get("chat_id") or "main")
            source = self._source_for(chat_id, str(frame.get("user_id") or "gtw"))
            await self.handle_message(MessageEvent(
                text="/stop", message_type=MessageType.COMMAND, source=source,
                message_id=_ms_id(), timestamp=datetime.datetime.now()))
        elif kind == "history":
            chat_id = str(frame.get("chat_id") or "main")
            await ws.send_json({"type": "history", "chat_id": chat_id,
                                "items": list(self._history.get(chat_id, []))})
        elif kind == "session_info":
            chat_id = str(frame.get("chat_id") or "main")
            await ws.send_json({"type": "session_info", "info": self._build_session_info(chat_id)})
        elif kind == "sessions":
            items = [self._build_session_info(cid) for cid in list(self._chat_stats)]
            items.sort(key=lambda x: x.get("lastActivity") or "", reverse=True)
            await ws.send_json({"type": "sessions", "items": items})
        elif kind == "models":
            await self._send_models(ws, frame)
        elif kind == "set_model":
            await self._set_model(ws, frame)
        else:
            await ws.send_json({"type": "error", "error": f"unknown_type:{kind}"})

    async def _send_models(self, ws, frame: dict[str, Any]) -> None:
        """Каталог моделей через публичный seam ядра (feature-detect, async-aware)."""
        chat_id = str(frame.get("chat_id") or "main")
        settings = self._session_settings(chat_id)
        current = {"model": str(settings.get("model") or ""), "provider": str(settings.get("provider") or "")}
        providers: list = []
        fn = getattr(self, "list_session_model_picker_providers", None)
        if callable(fn):
            try:
                st = self._stats(chat_id)
                source = self._source_for(chat_id, st["user_id"] or "gtw", st["user_name"] or "GTW")
                result = fn(source)
                if asyncio.iscoroutine(result):
                    result = await asyncio.wait_for(result, timeout=15)
                for p in result or []:
                    name = str(getattr(p, "name", None) or (p.get("name") if isinstance(p, dict) else "") or "")
                    models = getattr(p, "models", None) or (p.get("models") if isinstance(p, dict) else None) or []
                    if name:
                        providers.append({"name": name, "models": [str(m) for m in models][:100]})
            except Exception as e:
                logger.warning("GTW: model catalog unavailable: %s", e)
        await ws.send_json({"type": "models", "chat_id": chat_id, "current": current, "providers": providers})

    async def _set_model(self, ws, frame: dict[str, Any]) -> None:
        """Переключение модели командой /model (ядро само подтвердит в чат)."""
        chat_id = str(frame.get("chat_id") or "main")
        model = str(frame.get("model") or "").strip()
        ok = False
        if model and len(model) <= 200 and "\n" not in model and not model.startswith("/"):
            st = self._stats(chat_id)
            source = self._source_for(chat_id, st["user_id"] or "gtw", st["user_name"] or "GTW")
            try:
                await self.handle_message(MessageEvent(
                    text=f"/model {model}", message_type=MessageType.COMMAND, source=source,
                    message_id=_ms_id(), timestamp=datetime.datetime.now()))
                ok = True
            except Exception as e:
                logger.warning("GTW: set_model failed: %s", e)
        await ws.send_json({"type": "set_model_ack", "chat_id": chat_id, "model": model, "ok": ok})

    async def _inbound_message(self, frame: dict[str, Any]) -> None:
        text = str(frame.get("text") or "").strip()
        chat_id = str(frame.get("chat_id") or "main")
        if not text:
            return
        message_id = str(frame.get("message_id") or _ms_id())
        if self._dedup.is_duplicate(message_id):
            return
        user_id = str(frame.get("user_id") or "gtw")
        user_name = str(frame.get("user_name") or user_id)
        st = self._stats(chat_id)
        st["user_id"] = user_id
        st["user_name"] = user_name
        st["turns"] += 1
        self._touch(chat_id)
        self._remember(chat_id, "user", text, message_id)
        source = self.build_source(chat_id=chat_id, chat_name=chat_id, chat_type="dm",
                                   user_id=user_id, user_name=user_name)
        await self.handle_message(MessageEvent(
            text=text, message_type=MessageType.TEXT, source=source,
            user_id=user_id, user_name=user_name,
            message_id=message_id, timestamp=datetime.datetime.now()))

    async def _resolve_approval(self, frame: dict[str, Any]) -> None:
        from tools.approval import resolve_gateway_approval_card

        request_id = str(frame.get("request_id") or "")
        choice = str(frame.get("choice") or "deny")
        session_key = self._approval_sessions.get(request_id)
        if not session_key or choice not in ("once", "session", "always", "deny"):
            return
        resolved = resolve_gateway_approval_card(session_key, choice, request_id,
                                                 actor_id=str(frame.get("user_id") or "gtw"),
                                                 extra=self.config.extra)
        logger.info("GTW: approval %s choice=%s resolved=%d", request_id[:8], choice, resolved)
        await self._broadcast({"type": "approval_ack", "request_id": request_id,
                               "choice": choice, "resolved": resolved})

    # ── outbound: agent -> browser ───────────────────────────────────────────

    async def send(self, chat_id: str, content: str, reply_to: Optional[str] = None,
                   metadata: Optional[dict[str, Any]] = None):
        message_id = _ms_id()
        meta = metadata or {}
        st = self._stats(chat_id)
        self._touch(chat_id)
        if isinstance(meta.get("tool"), str):
            st["tools"] += 1
            if meta["tool"] not in st["tool_names"]:
                st["tool_names"].append(meta["tool"])
        elif meta.get("kind") not in ("thinking", "commentary", "reasoning", "status"):
            # финальный/промежуточный ответ агента — ход завершён
            self._turn_end(chat_id)
        self._remember(chat_id, "assistant", content, message_id)
        await self._broadcast({"type": "message", "chat_id": chat_id, "message_id": message_id,
                               "content": content, "metadata": meta})
        return SendResult(success=True, message_id=message_id)

    async def send_typing(self, chat_id: str, metadata=None) -> None:
        self._turn_start(chat_id)
        self._touch(chat_id)
        await self._broadcast({"type": "typing", "chat_id": chat_id})

    async def send_or_update_status(self, chat_id: str, status_key: str, content: str,
                                    metadata: Optional[dict[str, Any]] = None) -> SendResult:
        """Служебные статусы (tool-progress, рассуждения, прогресс) — отдельным
        кадром status, чтобы UI не рисовал их как полноценные ответы агента."""
        self._touch(chat_id)
        await self._broadcast({"type": "status", "chat_id": chat_id, "status_key": str(status_key or ""),
                               "content": content, "metadata": metadata or {}})
        return SendResult(success=True, message_id=str(status_key or _ms_id()))

    def supports_draft_streaming(self, chat_type: Optional[str] = None,
                                 metadata: Optional[dict[str, Any]] = None,
                                 chat_id: Optional[str] = None) -> bool:
        return True

    async def send_draft(self, chat_id: str, draft_id: int, content: str,
                         metadata: Optional[dict[str, Any]] = None) -> SendResult:
        st = self._stats(chat_id)
        st["out_chars"] = max(st["out_chars"], len(content or ""))
        self._touch(chat_id)
        await self._broadcast({"type": "draft", "chat_id": chat_id, "draft_id": draft_id,
                               "content": content, "metadata": metadata or {}})
        return SendResult(success=True, message_id=str(draft_id))

    async def edit_message(self, chat_id: str, message_id: str, content: str, *,
                           finalize: bool = False) -> SendResult:
        if finalize:
            self._turn_end(chat_id)
        self._touch(chat_id)
        await self._broadcast({"type": "message_edit", "chat_id": chat_id,
                               "message_id": message_id, "content": content, "finalize": finalize})
        return SendResult(success=True, message_id=message_id)

    async def _send_exec_approval_prompt(self, prompt) -> SendResult:
        if prompt.request_id:
            self._approval_sessions[prompt.request_id] = prompt.session_key
        await self._broadcast({
            "type": "approval_request",
            "chat_id": prompt.chat_id,
            "request_id": prompt.request_id,
            "command": prompt.command,
            "description": prompt.description,
            "text": prompt.text,
            "actions": [{"label": label, "choice": choice, "style": style}
                        for label, choice, style in prompt.actions],
        })
        return SendResult(success=True, message_id=prompt.request_id or _ms_id())

    async def send_clarify(self, chat_id: str, question: str, choices: Optional[list],
                           clarify_id: str, session_key: str,
                           metadata: Optional[dict[str, Any]] = None) -> SendResult:
        if choices:
            multi = False
            try:
                from tools.clarify_gateway import get_pending
                multi = bool(getattr(get_pending(clarify_id), "multi_select", False))
            except Exception:
                pass
            await self._broadcast({"type": "clarify_request", "chat_id": chat_id,
                                   "clarify_id": clarify_id, "question": question,
                                   "choices": list(choices), "multi_select": multi})
            return SendResult(success=True, message_id=clarify_id)
        return await super().send_clarify(chat_id, question, choices, clarify_id, session_key, metadata)

    async def send_image(self, chat_id: str, image_url: str, caption: Optional[str] = None, **kw):
        await self._broadcast({"type": "artifact", "chat_id": chat_id, "kind": "image",
                               "url": image_url, "caption": caption})
        return SendResult(success=True, message_id=_ms_id())

    async def send_document(self, chat_id: str, path: str, caption: Optional[str] = None, **kw):
        await self._broadcast({"type": "artifact", "chat_id": chat_id, "kind": "document",
                               "url": str(path), "caption": caption})
        return SendResult(success=True, message_id=_ms_id())

    async def get_chat_info(self, chat_id: str) -> dict[str, Any]:
        return {"name": chat_id, "type": "dm", "chat_id": chat_id}


# ── plugin registration ──────────────────────────────────────────────────────

def check_requirements() -> bool:
    return bool(_get_scoped_secret("GTW_TOKEN", ""))


def validate_config(config) -> bool:
    return bool(extra_or_secret(getattr(config, "extra", None), "token", "GTW_TOKEN"))


def is_connected(config) -> bool:
    return check_requirements()


def _env_enablement() -> Optional[dict]:
    if not _get_scoped_secret("GTW_TOKEN", "").strip():
        return None
    return _seed_extra_from_env(
        (("GTW_TOKEN", "token", None), ("GTW_PORT", "port", None), ("GTW_BIND", "bind", None)),
        home_env="GTW_HOME_CHANNEL",
    )


def register(ctx):
    """Plugin entry point — called by the Hermes plugin system."""
    kwargs = dict(
        name="gtw",
        label="GTW",
        dashboard_description="GTW web chat: browser UI for the Hermes agent with streaming, approvals and artifacts.",
        adapter_factory=GTWAdapter,
        check_fn=check_requirements,
        validate_config=validate_config,
        is_connected=is_connected,
        required_env=["GTW_TOKEN"],
        install_hint="No extra packages needed (aiohttp ships with Hermes)",
        env_enablement_fn=_env_enablement,
        cron_deliver_env_var="GTW_HOME_CHANNEL",
        allowed_users_env="GTW_ALLOWED_USERS",
        allow_all_env="GTW_ALLOW_ALL_USERS",
        max_message_length=0,  # web UI renders long markdown; no chunking
        emoji="🌲",
        pii_safe=True,
        platform_hint=(
            "You are chatting via GTW, a web chat UI. It renders full markdown "
            "(code blocks, tables, lists). Approval and clarify questions appear "
            "as interactive cards with buttons. Long responses are fine."
        ),
    )
    # Feature-detect: older cores reject unknown register_platform kwargs.
    try:
        from gateway.platform_registry import PlatformEntry
        known = {f.name for f in dataclasses.fields(PlatformEntry)}
        if "display_tier" in known:
            kwargs["display_tier"] = "high"  # tool progress + streaming + interim messages
    except Exception:
        pass
    ctx.register_platform(**kwargs)
