"""GTW-плагин: исходящие кадры (агент -> браузер).

Ответы и стриминг, служебные статусы, карточки approvals/clarify и артефакты
(трансляция sandbox-пути в host + кадр artifact). Перенос из adapter.py без
изменения логики (волна 5, C1).
"""

import logging
import mimetypes
import os
from pathlib import Path
from typing import Any, Optional

from gateway.platforms.base import SendResult

from ._util import _ms_id


logger = logging.getLogger(__name__)


class OutboundMixin:
    """Фреймы agent -> browser: message/draft/status/artifact."""

    # Служебный надж «no home channel» (gateway.notify.no_home_channel) бессмыслен для
    # GTW: веб-UI с явными чатами, а не messaging-платформа с cron-доставкой в home channel.
    # Подавляем его в адаптере (не правим ядро Hermes — переживает обновления). Маркеры
    # en+ru локалей + обязательный sethome, чтобы не задеть обычный ответ агента.
    _HOME_NUDGE_MARKERS = ("No home channel is set for", "не задан домашний канал")

    async def send(self, chat_id: str, content: str, reply_to: Optional[str] = None,
                   metadata: Optional[dict[str, Any]] = None):
        if "sethome" in content and any(m in content for m in self._HOME_NUDGE_MARKERS):
            return SendResult(success=True, message_id=_ms_id())
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
            # S1: владелец карточки = владелец чата (или "gtw", если чат ещё не принадлежит никому).
            self._approval_owner[prompt.request_id] = self._chat_owner.get(str(prompt.chat_id or ""), "gtw")
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
            # S1: владелец clarify-карточки = владелец чата (или "gtw", если неизвестен).
            self._clarify_owner[str(clarify_id)] = self._chat_owner.get(str(chat_id or ""), "gtw")
            await self._broadcast({"type": "clarify_request", "chat_id": chat_id,
                                   "clarify_id": clarify_id, "question": question,
                                   "choices": list(choices), "multi_select": multi})
            return SendResult(success=True, message_id=clarify_id)
        return await super().send_clarify(chat_id, question, choices, clarify_id, session_key, metadata)

    def _resolve_media_host_path(self, path: str, chat_id: str) -> Optional[str]:
        """Путь артефакта агента -> читаемый host-путь (sandbox->host трансляция ядра).

        Сначала проверяем, не host-ли это файл уже; иначе штатная трансляция
        validate_media_delivery_path / _translate_docker_container_media_path
        (denylist/allowlist ядра, scope активного профиля). None — не удалось.
        """
        p = str(path or "").strip()
        if not p:
            return None
        try:
            if os.path.isfile(p) and os.access(p, os.R_OK):
                return os.path.abspath(p)
        except Exception:
            pass
        try:
            from gateway.platforms.base import validate_media_delivery_path
            r = validate_media_delivery_path(p, session_key=None)
            if r and os.path.isfile(r):
                return str(r)
        except Exception:
            pass
        try:
            from gateway.platforms.base import _translate_docker_container_media_path
            r = _translate_docker_container_media_path(Path(p), session_key=None)
            if r is not None and r.is_file():
                return str(r)
        except Exception:
            pass
        return None

    @staticmethod
    def _media_meta(host_path: str) -> tuple[str, str, int]:
        name = os.path.basename(host_path)
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
        try:
            size = os.path.getsize(host_path)
        except Exception:
            size = 0
        return name, mime, size

    async def send_image(self, chat_id: str, image_url: str, caption: Optional[str] = None, **kw):
        host = self._resolve_media_host_path(image_url, chat_id)
        frame = {"type": "artifact", "chat_id": chat_id, "kind": "image",
                 "url": host or str(image_url), "caption": caption}
        if host:
            name, mime, size = self._media_meta(host)
            frame.update(name=name, mime=mime, size=size)
        await self._broadcast(frame)
        return SendResult(success=True, message_id=_ms_id())

    async def send_document(self, chat_id: str, file_path: str, caption: Optional[str] = None, **kw):
        # Имя параметра file_path — канон ядра (base.py): dispatch зовёт send_document(file_path=…).
        host = self._resolve_media_host_path(file_path, chat_id)
        frame = {"type": "artifact", "chat_id": chat_id, "kind": "document",
                 "url": host or str(file_path), "caption": caption}
        if host:
            name, mime, size = self._media_meta(host)
            frame.update(name=name, mime=mime, size=size)
        await self._broadcast(frame)
        return SendResult(success=True, message_id=_ms_id())

    async def send_image_file(self, chat_id: str, image_path: str, caption: Optional[str] = None, **kw):
        # Ядро шлёт локальные картинки через send_image_file(image_path=…), не send_image(image_url=…).
        host = self._resolve_media_host_path(image_path, chat_id)
        frame = {"type": "artifact", "chat_id": chat_id, "kind": "image",
                 "url": host or str(image_path), "caption": caption}
        if host:
            name, mime, size = self._media_meta(host)
            frame.update(name=name, mime=mime, size=size)
        await self._broadcast(frame)
        return SendResult(success=True, message_id=_ms_id())

    async def get_chat_info(self, chat_id: str) -> dict[str, Any]:
        return {"name": chat_id, "type": "dm", "chat_id": chat_id}
