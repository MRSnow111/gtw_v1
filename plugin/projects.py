"""GTW-плагин: проекты — домашний каталог песочницы и файлы проекта.

sandbox-home профиля (host-каталог, который контейнер видит как /root),
docker-cp fallback и префикс контекста проекта для агента. Перенос методов
из adapter.py без изменения логики (волна 5, C1).
"""

import logging
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any


logger = logging.getLogger(__name__)

# Лимиты/таймауты провизиона проектов (C3: были литералами в теле методов).
DOCKER_TIMEOUT_S = 15                     # docker ps / docker exec mkdir
DOCKER_CP_TIMEOUT_S = 30                  # docker cp файла проекта в контейнер
PROJECT_FILES_MAX = 50                    # сколько файлов проекта провиziemy за ход
PROJECT_FILE_NAME_MAX = 120               # длина sanitizированного имени файла
PROJECT_SLUG_MAX = 80                     # длина slug'а проекта в пути
PROJECT_FILES_LINE_MAX = 30               # сколько имён файлов перечисляем в контексте


class ProjectsMixin:
    """Проекты: каталог в песочнице + файлы + контекст."""

    def _sandbox_home(self, user_id: str, role: str) -> Path:
        """Host-каталог, который песочница профиля видит как /root.

        Docker-терминал (home_mode=auto) bind-монтирует /root из persistent-каталога
        <profile>/sandboxes/docker/profile_<name>-<hash>/home (ядро:
        get_sandbox_dir()/docker/_sandbox_dir_name(task_id)/home), а НЕ из <profile>/home.
        Для default-профиля каталог — литерал 'default'. Резолвим glob'ом по имени профиля
        (без правки ядра, устойчиво к смене хэша при смене образа — берём свежайший);
        fallback <profile>/home — для local-режима/ещё не созданной песочницы.
        """
        from hermes_constants import get_hermes_home
        override = os.getenv("TERMINAL_SANDBOX_DIR")
        if role == "admin" or user_id in self._admin_logins:
            root = Path(get_hermes_home())
            sandboxes = Path(override) if override else root / "sandboxes"
            cand = sandboxes / "docker" / "default" / "home"
            return cand if cand.is_dir() else root / "home"
        name = self._user_profile_name(user_id)
        profile_dir = self._profiles_dir() / name
        sandboxes = Path(override) if override else profile_dir / "sandboxes"
        docker_base = sandboxes / "docker"
        try:
            homes = [p / "home" for p in docker_base.glob(f"profile_{name}-*")
                     if (p / "home").is_dir()]
            if homes:
                return max(homes, key=lambda p: p.stat().st_mtime)
        except Exception:
            pass
        return profile_dir / "home"

    def _project_files_via_docker(self, user_id: str, slug: str, files: list) -> None:
        """Fallback-провизион файлов проекта в работающий контейнер профиля (docker cp).

        Вызывается, когда host-запись в sandbox-home упала с PermissionError (каталог
        принадлежит root — его создал агент контейнера). docker cp пишет от root внутрь
        контейнера, поэтому агент видит файлы в /root/projects/<slug> с корректными правами.
        Контейнер ищем по label hermes-profile=gtw-<login>; нет контейнера — тихо выходим.
        """
        try:
            label = self._user_profile_name(user_id)
            r = subprocess.run(
                ["docker", "ps", "-q", "--filter", f"label=hermes-profile={label}"],
                capture_output=True, text=True, timeout=DOCKER_TIMEOUT_S)
            cid = (r.stdout or "").strip().split("\n")[0].strip()
            if not cid:
                return
            dest_dir = f"/root/projects/{slug}"
            subprocess.run(["docker", "exec", cid, "mkdir", "-p", dest_dir],
                           capture_output=True, timeout=DOCKER_TIMEOUT_S)
            for pf in (files or [])[:PROJECT_FILES_MAX]:
                if not isinstance(pf, dict):
                    continue
                src = str(pf.get("storage_path") or "")
                fname = re.sub(r"[^\w.\-]", "_", str(pf.get("name") or "file"))[:PROJECT_FILE_NAME_MAX] or "file"
                if src and os.path.isfile(src):
                    subprocess.run(["docker", "cp", src, f"{cid}:{dest_dir}/{fname}"],
                                   capture_output=True, timeout=DOCKER_CP_TIMEOUT_S)
        except Exception:
            logger.debug("GTW: docker project provision failed", exc_info=True)

    def _project_context(self, frame: dict[str, Any], user_id: str, role: str) -> str:
        """Контекст проекта (фаза 3): рабочий каталог /root/projects/<slug> + файлы проекта.

        Создаёт каталог в home профиля (host) и копирует туда файлы проекта (best-effort):
        home_mode=auto -> контейнер видит HERMES_HOME/home как /root, поэтому host-каталог
        <profile>/home/projects/<slug> отображается в песочницу как /root/projects/<slug>.
        Возвращает префикс для текста агента; история ходов не засоряется (_remember уже вызван
        с исходным text). Блокирующий файловый IO — вызывать через asyncio.to_thread.
        """
        proj = frame.get("project")
        if not isinstance(proj, dict):
            return ""
        slug = re.sub(r"[^\w.\-]", "_", str(proj.get("slug") or ""))[:PROJECT_SLUG_MAX].strip(".-")
        name = str(proj.get("name") or "проект")
        if not slug:
            return ""
        sandbox_dir = f"/root/projects/{slug}"
        try:
            home = self._sandbox_home(user_id, role)
            host_dir = home / "projects" / slug
            host_dir.mkdir(parents=True, exist_ok=True)
            for pf in (frame.get("project_files") or [])[:PROJECT_FILES_MAX]:
                if not isinstance(pf, dict):
                    continue
                src = str(pf.get("storage_path") or "")
                fname = re.sub(r"[^\w.\-]", "_", str(pf.get("name") or "file"))[:PROJECT_FILE_NAME_MAX] or "file"
                if src and os.path.isfile(src):
                    try:
                        shutil.copyfile(src, str(host_dir / fname))
                    except Exception:
                        pass
        except PermissionError:
            # sandbox-home принадлежит root (каталог создал агент контейнера), host-процесс
            # адаптера (hermes) писать туда не вправе. Доставляем файлы прямо в работающий
            # контейнер профиля через docker cp (пишет root — корректные права для агента).
            self._project_files_via_docker(user_id, slug, frame.get("project_files") or [])
        except Exception:
            logger.debug("GTW: project dir provision failed", exc_info=True)
        files = frame.get("project_files") or []
        names = [str(f.get("name")) for f in files if isinstance(f, dict) and f.get("name")]
        files_line = ", ".join(names[:PROJECT_FILES_LINE_MAX]) if names else "пока нет"
        return (
            f"[Контекст проекта]\n"
            f"Этот чат относится к проекту «{name}».\n"
            f"Рабочий каталог проекта: {sandbox_dir}/ — создай его при необходимости "
            f"(mkdir -p {sandbox_dir}) и выполняй всю работу проекта в нём (cd {sandbox_dir}).\n"
            f"Файлы проекта сейчас: {files_line}.\n"
            f"Новые файлы проекта сохраняй в {sandbox_dir}/.\n"
            f"---\n"
        )
