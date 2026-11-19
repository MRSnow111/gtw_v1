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
  server -> client:
    {type:"hello"}
    {type:"message", chat_id, message_id, content, metadata?}
    {type:"draft", chat_id, draft_id, content, mode?}        # streaming preview
    {type:"message_edit", chat_id, message_id, content, finalize}
    {type:"typing", chat_id}
    {type:"approval_request", chat_id, request_id, command, description, text, actions:[{label,choice,style}]}
    {type:"clarify_request", chat_id, clarify_id, question, choices, multi_select}
    {type:"artifact", chat_id, kind, url, caption?}
    {type:"history", chat_id, items:[{role, content, ts, message_id}]}
    {type:"error", error}
"""

import asyncio
import contextlib
import dataclasses
import datetime
import logging
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
            source = self.build_source(chat_id=chat_id, chat_name=chat_id, chat_type="dm",
                                       user_id=str(frame.get("user_id") or "gtw"), user_name="GTW")
            await self.handle_message(MessageEvent(
                text="/stop", message_type=MessageType.COMMAND, source=source,
                message_id=_ms_id(), timestamp=datetime.datetime.now()))
        elif kind == "history":
            chat_id = str(frame.get("chat_id") or "main")
            await ws.send_json({"type": "history", "chat_id": chat_id,
                                "items": list(self._history.get(chat_id, []))})
        else:
            await ws.send_json({"type": "error", "error": f"unknown_type:{kind}"})

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
        self._remember(chat_id, "assistant", content, message_id)
        await self._broadcast({"type": "message", "chat_id": chat_id, "message_id": message_id,
                               "content": content, "metadata": metadata or {}})
        return SendResult(success=True, message_id=message_id)

    async def send_typing(self, chat_id: str, metadata=None) -> None:
        await self._broadcast({"type": "typing", "chat_id": chat_id})

    def supports_draft_streaming(self, chat_type: Optional[str] = None,
                                 metadata: Optional[dict[str, Any]] = None,
                                 chat_id: Optional[str] = None) -> bool:
        return True

    async def send_draft(self, chat_id: str, draft_id: int, content: str,
                         metadata: Optional[dict[str, Any]] = None) -> SendResult:
        await self._broadcast({"type": "draft", "chat_id": chat_id, "draft_id": draft_id,
                               "content": content, "metadata": metadata or {}})
        return SendResult(success=True, message_id=str(draft_id))

    async def edit_message(self, chat_id: str, message_id: str, content: str, *,
                           finalize: bool = False) -> SendResult:
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
