# GTW ↔ Hermes: архитектура моста

> Решение по итогам изучения `hermes-agent` (скилл + репозиторий NousResearch/hermes-agent,
> `gateway/platforms/ADDING_A_PLATFORM.md` и `website/docs/developer-guide/adding-platform-adapters.md`).

## Выбор: GTW — платформенный плагин Hermes gateway

Hermes gateway поддерживает добавление новых платформ **без правок ядра**: плагин
`~/.hermes/plugins/gtw/` из двух файлов (`plugin.yaml` + `adapter.py`), класс-наследник
`BasePlatformAdapter`, регистрация через `ctx.register_platform()` в `register(ctx)`.

GTW становится для агента такой же платформой, как Telegram/Discord: gateway сам
маршрутизирует сообщения в сессии агента, а адаптер получает ответы и служебные события.

Отвергнутые альтернативы:
- **Скрейпинг CLI** (`hermes chat -q` / tmux) — хрупко, нет структурированных событий, нет approvals.
- **Canonical gateway protocol** (как у desktop-приложения) — богаче RPC, но это внутренности
  Electron-стека с ticket-грантами и journal'ами; для v1 избыточно и нестабильно как API.

## Что gateway даёт бесплатно (реестр платформы)

- создание адаптера, парсинг конфига (`gateway.platforms.gtw.enabled/extra` в config.yaml);
- авторизация пользователей (`GTW_ALLOWED_USERS` / `GTW_ALLOW_ALL_USERS`);
- сессии и история агента (state.db), маршрутизация `send_message`, cron-доставка
  (`deliver=gtw` через `GTW_HOME_CHANNEL`);
- подсказка платформе в системном промпте (`platform_hint` — «рендерит markdown, поддерживает карточки подтверждений»);
- умное чанкование длинных ответов (`max_message_length`);
- `display_tier='high'` — tool-progress, стриминг и промежуточные сообщения идут в адаптер.

## Топология

```
браузер ──HTTPS──> Next.js (GTW UI, наш репозиторий)
                     │  httpOnly-кука gtw-auth (логин уже реализован)
                     │  Next API route выдаёт короткоживущий WS-тикет
                     ▼
                  WSS ──> gtw-адаптер (Python, внутри процесса hermes gateway на хосте)
                            │  aiohttp WebSocket-сервер, порт GTW_PORT (напр. 8765)
                            ▼
                         hermes gateway ──> агент (сессии, инструменты, approvals)
```

Адаптер и Next-приложение могут жить на одной машине (хост пользователя) или на разных —
связь только по WS, адрес/порт/токен через env (`GTW_PORT`, `GTW_TOKEN`).

## Маппинг событий адаптера → протокол GTW (events v2)

> **СТАТУС: протокол v2 НЕ реализован.** Боевой контракт — плоские JSON-кадры
> адаптера с полями `type`/`chat_id` (`user_message`, `message`, `draft`,
> `message_edit`, `status`, `typing`, `approval_request`/`approval_ack`,
> `clarify_request`/`clarify_ack`, `artifact`, `history`, `session_info`,
> `sessions`, `models`, `set_model_ack`, `browser_live`/`browser_frame`/
> `browser_live_ack`, `error`, `hello`); канонический список — docstring
> `plugin/adapter.py`, типы во фронте — `src/types/events.ts`. Таблица ниже —
> исходный проект v2 (имена событий вида `message.final`), оставлен как
> справка по маппингу методов адаптера: в этих именах ничего не реализовано.

| Метод адаптера | Событие WS для фронта | UI |
|---|---|---|
| `handle_message(MessageEvent)` (входящее от браузера) | — | отправка из композера |
| `send(chat_id, content, metadata)` | `message.final` / сегменты хода | текст агента (markdown) |
| `send_draft` / `edit_message` (стриминг-превью) | `message.delta` | живой набор текста |
| tool-progress (display tier high) | `tool.start` / `tool.end` | строки инструментов |
| `send_typing` | `turn.status: thinking` | индикатор «думает» |
| `send_exec_approval` / `_send_exec_approval_prompt` | `approval.request` | карточка Разрешить/Запретить |
| ответ браузера на карточку | `tools.approval.resolve_gateway_approval_card(request_id, choice)` | решение |
| `send_clarify` | `clarify.request` | карточка вопроса с вариантами |
| `send_slash_confirm` | `confirm.request` | Once/Always/Cancel |
| `send_image` / `send_document` | `artifact.ready` | панель артефактов |

Входящие от браузера: текст → `MessageEvent` + `self.handle_message(event)`;
`chat_id` = id чата GTW (gateway ведёт сессию на chat_id); кнопки approvals/clarify
роутятся в резолверы gateway по конвенции id (`appr:<id>:<choice>`, `cl:<id>:<idx>`).

## Обязательные методы адаптера (минимум v1)

`__init__`, `connect()` (поднять WS-сервер, `_mark_connected`), `disconnect()`,
`send()`, `get_chat_info()`; опционально `send_typing`, `send_image`, `send_document`,
`send_clarify`, `_send_exec_approval_prompt`, `send_draft`/`edit_message` (стриминг).
Плюс `check_requirements()`, `validate_config()`, `env_enablement_fn` по образцу из гайда.

## Правила из гайда, которые соблюдаем

- `self.build_source(...)` для SessionSource (не конструктор напрямую);
- сессионные ключи через `_event_session_key` / `_source_session_key`;
- `MessageDeduplicator` от повторных доставок; reconnect с backoff+jitter;
- не логировать тела сообщений/PII на INFO+;
- `trusted_inbound` НЕ ставим (это чат-платформа с людьми);
- env-секреты через `get_scoped_secret` / `extra_or_secret` (multiplex-safe).

## План работ

> **СТАТУС (2026-11-25):** п.1 выполнен и в бою (плагин + WS-сервер + approvals/
> clarify + стриминг + артефакты + модели + изоляция профилей + live-просмотр);
> п.2 выполнен частично — события живым сокетом, но НЕ под именем v2 (см.
> пометку выше); п.3 выполнен иначе — WS-тикетов нет, `server.js` проксирует
> `/ws` с httpOnly-кукой и подставляет `X-GTW-Token`, история идёт тем же
> сокетом кадром `history` (отдельного REST `/history` нет; есть HTTP-роуты
> чатов/файлов/проектов); п.4 выполнен (плагин на хосте gateway, наружу только
> HTTPS Next'а, 8765 loopback).

1. **Плагин `gtw`** (Python): WS-сервер + адаптер по таблице выше; токен-авторизация WS;
   тикеты от Next API. Тест: `hermes gateway` с включённой платформой, эхо-проверка событий.
2. **events v2 во фронте**: типы + маршрутизация WS в сторы (замена `// TODO` в useWebSocket);
   демо-режим остаётся как fallback без бэкенда.
3. **Next API**: `/api/gtw/ticket` (выдаёт WS-тикет, проверяя куку), проксирование истории
   (адаптер отдаёт историю сессии по REST рядом с WS).
4. **Деплой**: плагин на хост пользователя (там его Hermes), Next — туда же или отдельно;
   наружу только HTTPS Next-приложения, WS-порт закрыт от интернета (проксируется Next'ом).

## Открытые вопросы (проверить при реализации п.1)

Все три закрыты в ходе реализации плагина; пункты оставлены с ответами:

- **формат metadata у tool-progress и стриминг-draft'ов** — закрыто: tool-progress
  приходит отдельными `status`-кадрами (`display_tier='high'`), стриминг — кадрами
  `draft` (`draft_id`, `mode`) и `message_edit` с `finalize`; во фронте
  tool-progress обычным пользователям скрыт (фильтр по эмодзи-префиксам,
  синхронизированный с `scripts/probe.py`);
- **как адаптеру читать историю сессии** — закрыто: REST `/history` не делал, история
  живёт в памяти адаптера (deque на chat_id, лимит 500) и отдаётся тем же сокетом
  кадром `history`; персист из state.db — открытая задача (см. «Ограничения v0.3»
  в `plugin/README.md`);
- **multiplex-профили** — закрыто: GTW не привязан к одному профилю, каждый логин
  провизионится в свой Hermes-профиль и маршрутизируется через `profile_routes`
  (`_ensure_user_routed` в `plugin/adapter.py`); владелец/админ остаётся на
  default-профиле.
