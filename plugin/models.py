"""GTW-плагин: каталог моделей и переключение модели чата.

Seam ядра (feature-detect) + запасной прямой каталог из config; перевод
«DisplayName/model» из пикера в «/model <id> --provider <slug>» (PATH A).
Перенос из adapter.py без изменения логики (волна 5, C1).
"""

import asyncio
import datetime
import logging
from typing import Any

from gateway.platforms.event import MessageEvent, MessageType

from ._util import _ms_id


logger = logging.getLogger(__name__)

# Лимиты каталога/переключения моделей (C3: были литералами в теле методов).
CATALOG_MAX_MODELS = None        # None = без лимита: полный каталог провайдеров
PICKER_WAIT_TIMEOUT_S = 15       # ждём seam-каталог ядра
MODEL_NAME_MAX_LEN = 200         # разумный предел строки «DisplayName/model»


class ModelsMixin:
    """Каталог моделей, set_model и разбор slug провайдера."""

    def _catalog_direct(self) -> tuple[list, dict]:
        """Запасной каталог напрямую через list_picker_providers + config.

        Не зависит от runner-контекста миксина (который может вернуть None без
        runner/профиля). Тот же контракт, что у CLI-пикера; кэш каталога на диске.
        Выполнять в asyncio.to_thread (дисковый I/O)."""
        from hermes_cli.config import load_config, get_compatible_custom_providers
        from hermes_cli.model_switch_providers import list_picker_providers
        cfg = load_config() or {}
        m = cfg.get("model") if isinstance(cfg.get("model"), dict) else {}
        cur = {"model": str(m.get("default") or m.get("model") or ""),
               "provider": str(m.get("provider") or ""),
               "base_url": str(m.get("base_url") or "")}
        catalog_cfg = cfg.get("model_catalog")
        rows = list_picker_providers(
            current_provider=cur["provider"] or "openrouter",
            current_base_url=cur["base_url"], current_model=cur["model"],
            user_providers=(cfg.get("providers") or {}),
            custom_providers=get_compatible_custom_providers(cfg),
            max_models=CATALOG_MAX_MODELS, include_moa=True,
            excluded_providers=(catalog_cfg.get("excluded_providers")
                                if isinstance(catalog_cfg, dict) else None),
            probe_custom_providers=False, probe_current_custom_provider=False,
            non_blocking_catalogs=True)
        providers = []
        for r in rows or []:
            name = str(r.get("name") or r.get("slug") or "")
            if name:
                providers.append({"name": name, "slug": str(r.get("slug") or ""),
                                  "models": [str(x) for x in (r.get("models") or [])]})
        return providers, cur

    async def _send_models(self, ws, frame: dict[str, Any]) -> None:
        """Каталог моделей: seam ядра (feature-detect) + запасной прямой каталог."""
        chat_id = str(frame.get("chat_id") or "main")
        settings = self._session_settings(chat_id)
        current = {"model": str(settings.get("model") or ""), "provider": str(settings.get("provider") or "")}
        providers: list = []
        fn = getattr(self, "list_session_model_picker_providers", None)
        if callable(fn):
            try:
                st = self._stats(chat_id)
                source = self._source_for(chat_id, st["user_id"] or "gtw", st["user_name"] or "GTW")
                result = fn(source, max_models=CATALOG_MAX_MODELS)
                if asyncio.iscoroutine(result):
                    result = await asyncio.wait_for(result, timeout=PICKER_WAIT_TIMEOUT_S)
                for p in result or []:
                    name = str(getattr(p, "name", None) or (p.get("name") if isinstance(p, dict) else "") or "")
                    slug = str(getattr(p, "slug", None) or (p.get("slug") if isinstance(p, dict) else "") or "")
                    models = getattr(p, "models", None) or (p.get("models") if isinstance(p, dict) else None) or []
                    if name:
                        # slug — для карты slug→display в GTW-прокси (гейт моделей):
                        # session_info/current несут slug, каталог и белый список — display.
                        providers.append({"name": name, "slug": slug, "models": [str(m) for m in models]})
            except Exception as e:
                logger.warning("GTW: model catalog unavailable: %s", e)
        # Запасной путь: прямой каталог из config — работает и без runner-контекста.
        if not providers:
            try:
                direct, cur = await asyncio.to_thread(self._catalog_direct)
                providers = direct
                if not current["model"] and cur["model"]:
                    current = {"model": cur["model"], "provider": cur["provider"]}
            except Exception as e:
                logger.warning("GTW: direct model catalog unavailable: %s", e)
        await ws.send_json({"type": "models", "chat_id": chat_id, "current": current, "providers": providers})

    async def _set_model(self, ws, frame: dict[str, Any]) -> None:
        """Переключение модели (ядро само подтвердит в чат).

        Пикер шлёт «DisplayName/model». Текстовая команда /model без --provider идёт по
        PATH B ядра и НЕ снимает префикс custom-провайдера: роутерная модель вида
        «Selectel_Router_api/anthropic/claude-haiku-5.5» целиком уходит именем модели в
        ТЕКУЩИЙ провайдер и падает с «not found in this provider's model listing».
        Переводим в PATH A: «/model <model> --provider <slug>», slug берём из seam-каталога
        по отображаемому имени (тому же, что в пикере)."""
        chat_id = str(frame.get("chat_id") or "main")
        model = str(frame.get("model") or "").strip()
        ok = False
        if model and len(model) <= MODEL_NAME_MAX_LEN and "\n" not in model and not model.startswith("/"):
            st = self._stats(chat_id)
            # identity чата фиксируем УЖЕ при switch (server.js шлёт user_id=login):
            # /model должен примениться к той же сессии, что и последующие user_message,
            # иначе override уходит в сессию "gtw" и модель откатывается к дефолту профиля.
            uid = str(frame.get("user_id") or st["user_id"] or "gtw")
            uname = str(frame.get("user_name") or st["user_name"] or uid)
            st["user_id"] = uid
            st["user_name"] = uname
            source = self._source_for(chat_id, uid, uname)
            command = await self._model_switch_command(model, source)
            try:
                await self.handle_message(MessageEvent(
                    text=command, message_type=MessageType.COMMAND, source=source,
                    message_id=_ms_id(), timestamp=datetime.datetime.now()))
                ok = True
            except Exception as e:
                logger.warning("GTW: set_model failed: %s", e)
        await ws.send_json({"type": "set_model_ack", "chat_id": chat_id, "model": model, "ok": ok})

    async def _model_switch_command(self, model: str, source: Any) -> str:
        """«DisplayName/model» -> «/model <model> --provider <slug>» (PATH A).

        Имя провайдера не содержит «/», поэтому первый «/» всегда отделяет имя от id модели
        (сам id может быть роутерным, «anthropic/claude-haiku-5.5»). Если имя не найдено в
        каталоге — оставляем исходную строку (запасной PATH B: голую «vendor/model» ядро
        маршрутизирует само по объявленным моделям провайдеров)."""
        if "/" not in model:
            return f"/model {model}"
        display, _, model_id = model.partition("/")
        display, model_id = display.strip(), model_id.strip()
        if not display or not model_id:
            return f"/model {model}"
        slug = await self._provider_slug_for_name(display, source)
        if slug:
            return f"/model {model_id} --provider {slug}"
        return f"/model {model}"

    async def _provider_slug_for_name(self, display: str, source: Any) -> str:
        """Slug провайдера по отображаемому имени из seam-каталога (имя совпадает с пикером).

        resolve_provider_full не годится: встроенные label вроде «Alibaba Cloud (Token Plan)»
        он не резолвит, а seam-строки несут точную пару name/slug для всех провайдеров."""
        fn = getattr(self, "list_session_model_picker_providers", None)
        if not callable(fn):
            return ""
        try:
            result = fn(source)
            if asyncio.iscoroutine(result):
                result = await asyncio.wait_for(result, timeout=PICKER_WAIT_TIMEOUT_S)
            want = display.strip().lower()
            for p in result or []:
                name = str(getattr(p, "name", None) or (p.get("name") if isinstance(p, dict) else "") or "")
                slug = str(getattr(p, "slug", None) or (p.get("slug") if isinstance(p, dict) else "") or "")
                if name and slug and name.strip().lower() == want:
                    return slug
        except Exception as e:
            logger.warning("GTW: provider slug lookup failed: %s", e)
        return ""
