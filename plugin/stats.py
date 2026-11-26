"""GTW-плагин: статистика сессий (модель/провайдер, токены, скорость, тулзы).

Счётчики читаются из кэша gateway (feature-detect) с деградацией до оценки по
объёму стрима (source:"estimate"). Перенос из adapter.py без смены логики (C1).
"""

import contextlib
import datetime
import logging
import time
from typing import Optional


logger = logging.getLogger(__name__)

# Лимиты сборки статистики (C3: были литералами в теле методов).
TOOL_NAMES_MAX = 12        # сколько имён инструментов отдаём в session_info
CHARS_PER_TOKEN = 4        # грубая оценка токенов, когда счётчики ядра недоступны


class StatsMixin:
    """Учёт хода и сборка кадров session_info/sessions."""

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

    def _session_settings(self, chat_id: str) -> dict:
        """Модель/провайдер/session_key: seam ядра (feature-detect) + запасной config.model."""
        fn = getattr(self, "get_session_model_settings", None)
        st = self._stats(chat_id)
        if callable(fn):
            try:
                settings = fn(self._source_for(chat_id, st["user_id"] or "gtw", st["user_name"] or "GTW"))
                if settings:
                    return dict(settings)
            except Exception as e:
                logger.debug("GTW: session model settings unavailable: %s", e)
        try:
            from hermes_cli.config import load_config
            cfg = load_config() or {}
            m = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}
            model = str(m.get("default") or m.get("model") or "")
            if model:
                return {"model": model, "provider": str(m.get("provider") or ""),
                        "base_url": str(m.get("base_url") or ""), "session_key": ""}
        except Exception:
            pass
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
                    tps = round(cps / CHARS_PER_TOKEN, 1)  # грубая оценка: ~4 символа на токен
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
            "tools": {"count": st["tools"], "names": st["tool_names"][-TOOL_NAMES_MAX:]},
            "turns": st["turns"],
            "lastActivity": st["last_activity"],
        }
