"""GTW-плагин: изоляция пользователей по профилям Hermes (multiplex).

Провизион профиля (клонирование default), served-кэш, инжекция/персист
маршрутов profile_routes. Миксин собран из методов adapter.py без смены
логики (волна 5, C1); ленивые импорты ядра сохранены намеренно.
"""

import json
import logging
import re
import subprocess
import sys
import threading
import time
from pathlib import Path


logger = logging.getLogger(__name__)

# Таймауты/лимиты провизиона профилей (волна 5, C3: были литералами в теле).
PROFILE_CREATE_TIMEOUT_S = 180            # hermes profile create (клон default)
SERVE_WAIT_TIMEOUT_S = 30.0               # ждём, пока мультиплексор поднимет профиль
SERVE_POLL_INTERVAL_S = 0.5               # период опроса served_profiles
ROUTES_PERSIST_TIMEOUT_S = 60             # hermes config set gateway.profile_routes
PROFILE_NAME_PREFIX = "gtw-"              # префикс имени профиля пользователя
PROFILE_SLUG_MAX = 56                     # длина slug'а логина в имени профиля


class IsolationMixin:
    """Маршрутизация пользователя в его профиль Hermes."""

    def _multiplex_on(self) -> bool:
        if self._multiplex_cache is None:
            try:
                from hermes_cli.config import load_config
                gw = (load_config() or {}).get("gateway") or {}
                self._multiplex_cache = bool(gw.get("multiplex_profiles"))
            except Exception:
                self._multiplex_cache = False
        return self._multiplex_cache

    @staticmethod
    def _user_profile_name(login: str) -> str:
        slug = re.sub(r"[^a-z0-9_-]+", "-", str(login).lower()).strip("-_")[:PROFILE_SLUG_MAX]
        return PROFILE_NAME_PREFIX + (slug or "user")

    @staticmethod
    def _profiles_dir() -> Path:
        from hermes_constants import get_hermes_home
        return Path(get_hermes_home()) / "profiles"

    def _read_served(self) -> set:
        try:
            from hermes_constants import get_hermes_home
            d = json.loads((Path(get_hermes_home()) / "gateway_state.json").read_text())
            return set(d.get("served_profiles") or [])
        except Exception:
            return set()

    def _is_served_fast(self, name: str) -> bool:
        if name in self._served_cache:
            return True
        served = self._read_served()
        self._served_cache |= served
        return name in served

    def _prov_lock(self, name: str) -> threading.Lock:
        with self._prov_guard:
            lk = self._prov_locks.get(name)
            if lk is None:
                lk = threading.Lock()
                self._prov_locks[name] = lk
            return lk

    def _create_profile(self, name: str) -> None:
        """Создать профиль пользователя клонированием default (модели/ключи/навыки),
        затем обнулить унаследованную память владельца. Каналы платформ не клонируются,
        поэтому второй WS-сервер на 8765 не поднимается. Выполнять в отдельном потоке."""
        cmd = [sys.executable, "-m", "hermes_cli.main", "profile", "create", name,
               "--clone-from", "default", "--no-alias"]
        subprocess.run(cmd, capture_output=True, text=True, timeout=PROFILE_CREATE_TIMEOUT_S)
        mem = self._profiles_dir() / name / "memories"
        for f in ("MEMORY.md", "USER.md"):
            try:
                (mem / f).write_text("")
            except Exception:
                pass

    def _ensure_provisioned_served(self, name: str, timeout: float = SERVE_WAIT_TIMEOUT_S) -> bool:
        """Гарантировать, что профиль создан и обслуживается мультиплексором.
        Блокирующий (вызывать через asyncio.to_thread). Кэш делает повторные вызовы быстрыми."""
        if self._is_served_fast(name):
            return True
        with self._prov_lock(name):
            if self._is_served_fast(name):
                return True
            if not (self._profiles_dir() / name).exists():
                try:
                    self._create_profile(name)
                except Exception as e:
                    logger.warning("GTW: profile create %s failed: %s", name, e)
                    return False
            deadline = time.time() + timeout
            while time.time() < deadline:
                if self._is_served_fast(name):
                    return True
                time.sleep(SERVE_POLL_INTERVAL_S)
            logger.warning("GTW: profile %s not served within %.0fs", name, timeout)
            return False

    def _inject_route(self, name: str, login: str) -> bool:
        """Добавить маршрут platform=gtw user_id=login -> profile=name в живой конфиг
        шлюза (runner.config.profile_routes). Оба потребителя — штампование source.profile
        в build_source (_profile_name_for_source) и admission (_runtime_profile) — читают
        этот список, поэтому маршрут действует БЕЗ рестарта. Персист в config.yaml — для
        durability. Атомарная замена списка безопасна для конкурентных читателей."""
        runner = getattr(self, "gateway_runner", None)
        cfg = getattr(runner, "config", None)
        if cfg is None:
            return False
        from gateway.profile_routing import ProfileRoute
        routes = list(getattr(cfg, "profile_routes", []) or [])
        if any(r.platform == "gtw" and r.user_id == login for r in routes):
            return True  # маршрут уже есть (в памяти или загружен из yaml после рестарта)
        route = ProfileRoute(name=name, platform="gtw", profile=name,
                             user_id=login, enabled=True)
        cfg.profile_routes = routes + [route]
        try:
            self._persist_routes()
        except Exception as e:
            logger.warning("GTW: persist routes failed: %s", e)
        return True

    def _persist_routes(self) -> None:
        """Записать полный текущий список маршрутов в config.yaml (переживает рестарт)."""
        with self._persist_lock:
            runner = getattr(self, "gateway_runner", None)
            routes = list(getattr(getattr(runner, "config", None), "profile_routes", []) or [])
            data = []
            for r in routes:
                d = {"name": r.name, "platform": r.platform, "profile": r.profile,
                     "enabled": bool(r.enabled)}
                for fld in ("user_id", "guild_id", "chat_id", "thread_id", "bot_profile"):
                    v = getattr(r, fld, None)
                    if v:
                        d[fld] = v
                data.append(d)
            cmd = [sys.executable, "-m", "hermes_cli.main", "config", "set",
                   "gateway.profile_routes", json.dumps(data)]
            subprocess.run(cmd, capture_output=True, text=True, timeout=ROUTES_PERSIST_TIMEOUT_S)

    def _remove_route(self, login: str) -> None:
        """Снять маршрут platform=gtw user_id=login (если есть) из живого конфига + yaml.
        Используется для admin: админ работает в default-профиле, маршрут ему не нужен."""
        runner = getattr(self, "gateway_runner", None)
        cfg = getattr(runner, "config", None)
        if cfg is None:
            return
        routes = list(getattr(cfg, "profile_routes", []) or [])
        kept = [r for r in routes if not (r.platform == "gtw" and r.user_id == login)]
        if len(kept) != len(routes):
            cfg.profile_routes = kept
            try:
                self._persist_routes()
            except Exception as e:
                logger.warning("GTW: persist routes failed: %s", e)

    def _ensure_user_routed(self, login: str) -> bool:
        """Полный цикл изоляции пользователя: профиль создан + обслуживается + маршрут
        инжектирован. Блокирующий (вызывать через asyncio.to_thread). Идемпотентно.
        Admin не изолируется: работает в default, маршрут (если был) снимается."""
        if login in self._admin_logins:
            self._remove_route(login)
            self._routed_cache.discard(self._user_profile_name(login))
            return True
        name = self._user_profile_name(login)
        if name in self._routed_cache:
            return True
        if not self._ensure_provisioned_served(name):
            return False
        if self._inject_route(name, login):
            self._routed_cache.add(name)
            return True
        return False

    def _kick_provision(self, name: str, login: str) -> None:
        """Фоновый провизион+маршрут (не блокирует цикл событий) для путей models/session_info."""
        if name in self._routed_cache:
            return
        lk = self._prov_lock(name)
        if lk.locked():
            return
        threading.Thread(target=lambda: self._ensure_user_routed(login),
                         daemon=True).start()

    def build_source(self, *args, **kwargs):
        """Override: нативное штампование source.profile делает ядро по маршруту
        (profile_routes). Здесь лишь запускаем фоновый провизион+инжекцию маршрута,
        если профиль пользователя ещё не готов. Авторитетный цикл первого сообщения —
        в _inbound_message (await to_thread(_ensure_user_routed))."""
        source = super().build_source(*args, **kwargs)
        login = kwargs.get("user_id")
        if login is None and len(args) >= 4:
            login = args[3]  # chat_id, chat_name, chat_type, user_id
        if login and str(login) != "gtw" and str(login) not in self._admin_logins \
                and self._multiplex_on():
            name = self._user_profile_name(str(login))
            if name not in self._routed_cache:
                self._kick_provision(name, str(login))
        return source
