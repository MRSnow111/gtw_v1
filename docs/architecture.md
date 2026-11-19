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

1. **Плагин `gtw`** (Python): WS-сервер + адаптер по таблице выше; токен-авторизация WS;
   тикеты от Next API. Тест: `hermes gateway` с включённой платформой, эхо-проверка событий.
2. **events v2 во фронте**: типы + маршрутизация WS в сторы (замена `// TODO` в useWebSocket);
   демо-режим остаётся как fallback без бэкенда.
3. **Next API**: `/api/gtw/ticket` (выдаёт WS-тикет, проверяя куку), проксирование истории
   (адаптер отдаёт историю сессии по REST рядом с WS).
4. **Деплой**: плагин на хост пользователя (там его Hermes), Next — туда же или отдельно;
   наружу только HTTPS Next-приложения, WS-порт закрыт от интернета (проксируется Next'ом).

## Открытые вопросы (проверить при реализации п.1)

- точный формат metadata у tool-progress и стриминг-draft'ов (читать `gateway/outbound/` и
  stream consumer в исходниках при написании адаптера);
- как адаптеру читать историю сессии для REST `/history` (state.db / session transcripts);
- multiplex-профили: какой профиль gateway будет обслуживать GTW (у пользователя их несколько).
