"""GTW-плагин: регистрация платформы в реестре Hermes (entry point).

Точка входа принимает класс адаптера аргументом (make_register), чтобы этот
модуль не импортировал adapter.py — зависимости в пакете однонаправленные
(adapter.py -> registration.py), циклов нет (волна 5, C1). Тело register()
перенесено дословно, кроме adapter_factory=GTWAdapter -> adapter_cls.
"""

import dataclasses
import logging
from typing import Any, Callable, Optional

from gateway.platforms._shared import (
    extra_or_secret,
    get_scoped_secret as _get_scoped_secret,
    seed_extra_from_env as _seed_extra_from_env,
)


logger = logging.getLogger(__name__)


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


def make_register(adapter_cls: Any) -> Callable:
    """Собрать entry point register(ctx) без импорта adapter.py (нет циклов)."""

    def register(ctx):
        """Plugin entry point — called by the Hermes plugin system."""
        kwargs = dict(
            name="gtw",
            label="GTW",
            dashboard_description="GTW web chat: browser UI for the Hermes agent with streaming, approvals and artifacts.",
            adapter_factory=adapter_cls,
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
                "You are chatting via GTW, a web chat UI with an artifact preview panel. "
                "It renders full markdown (code blocks, tables, lists); approval and clarify "
                "questions appear as interactive cards with buttons. "
                "FILE DELIVERY: when you create a file the user wants to see or download "
                "(markdown, HTML, code, PDF, Office documents, images, archives), deliver it "
                "by adding a line `MEDIA:<absolute path of the saved file>` — substitute the "
                "REAL path where you saved it; GTW then opens it in the preview panel "
                "automatically. Only emit MEDIA for a file that actually exists on disk "
                "(check it first); NEVER emit an example, placeholder, or template path. "
                "If you could not create the file, tell the user plainly instead of emitting "
                "a MEDIA line. Do NOT paste the file's full content into the chat when a file "
                "was requested; give a brief summary and the MEDIA line instead. Long text "
                "responses are fine otherwise. "
                "SHOWING EXISTING FILES: when the user asks to show, open, preview or download "
                "a file that ALREADY exists (created in an earlier turn, uploaded by the user, "
                "or living in the project working directory), emit `MEDIA:<absolute path of "
                "that file>` — this is exactly how GTW shows files: the preview panel opens it "
                "automatically. You CAN show and open files this way; NEVER answer that you "
                "cannot show, open or preview files. Locate the file first (ls/find), verify "
                "it exists, then emit the MEDIA line with a brief comment. "
                "OFFICE FILES (Word/Excel/PowerPoint/PDF): use the microsoft-office skill. "
                "Its scripts need python-docx/openpyxl/python-pptx, which are NOT in the "
                "default python3 — they live in a private venv at "
                "$HOME/.cache/hermes-docs-venv. If that venv is missing, build it with the "
                "skill's bootstrap first, then run the scripts with "
                "$HOME/.cache/hermes-docs-venv/bin/python (never bare python3)."
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
    return register
