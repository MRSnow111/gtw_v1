# GTW-плагин для Hermes gateway

Платформенный адаптер: превращает GTW (веб-чат) в платформу Hermes наравне с
Telegram/Discord. Внутри процесса gateway поднимается WebSocket-сервер, к которому
подключается Next.js-фронтенд GTW. Архитектура и маппинг событий — `docs/architecture.md`.

## Установка на хосте (где живёт Hermes)

```bash
# 1. Файлы плагина
mkdir -p ~/.hermes/plugins/gtw
cd ~/.hermes/plugins/gtw
curl -fsSL https://raw.githubusercontent.com/MRSnow111/gtw_v1/main/plugin/plugin.yaml -o plugin.yaml
curl -fsSL https://raw.githubusercontent.com/MRSnow111/gtw_v1/main/plugin/adapter.py -o adapter.py

# 2. Токен WS-эндпоинта (секрет; Next.js-сервер будет прикреплять его к проксируемым WS)
echo "GTW_TOKEN=$(openssl rand -hex 32)" >> ~/.hermes/.env

# 3. Авторизация: один владелец — разрешаем всех аутентифицированных GTW-сессий
echo "GTW_ALLOW_ALL_USERS=true" >> ~/.hermes/.env
# (альтернатива: GTW_ALLOWED_USERS=demo — список логинов GTW через запятую)

# 4. Включить плагин и платформу
hermes plugins enable gtw-platform
hermes config set gateway.platforms.gtw.enabled true

# 5. Перезапуск gateway (один на хост, обслуживает все профили)
hermes -p default gateway restart

# 6. Проверка
hermes gateway status        # в списке платформ должна появиться GTW
curl -s http://127.0.0.1:8765/health   # {"ok": true}
```

По умолчанию WS слушает `127.0.0.1:8765` (наружу не торчит). Порт/адрес меняются
через `GTW_PORT` / `GTW_BIND` в `.env` или `gateway.platforms.gtw.extra` в config.yaml.

## Подключение фронта

Next.js-приложение GTW проксирует WS на `ws://127.0.0.1:8765/ws`, прикрепляя
`X-GTW-Token: <GTW_TOKEN>` на серверной стороне (браузер токен не видит).
Протокол кадров — в docstring `adapter.py`.

## Что уже покрыто

- текст в обе стороны (markdown без чанкования), стриминг-draft'ы и edit/finalize;
- typing-индикатор; tool-progress приходит через `display_tier=high`;
- карточки approvals (once/session/always/deny) и clarify (включая multi-select);
- артефакты (image/document), `/stop`, история чата (в памяти, до 500 сообщений);
- дедупликация входящих по message_id, токен-авторизация WS, heartbeat 30с.

## Ограничения v0.1

- история в памяти адаптера (переживает reconnect браузера, но не перезапуск gateway);
  персистентная история из state.db — следующий шаг;
- один WS-эндпоинт на профиль; несколько браузеров видят один поток (single-owner);
- slash-confirm карточки пока текстовым fallback'ом.

## Тесты

`python3 /root/gtw-test/harness.py` (в песочнице разработки) — 24 проверки
транспортного уровня: авторизация, dispatch, send/draft/edit, approvals/clarify,
артефакты, история, stop, дедуп, register(). Стабы gateway-API сверены с исходниками
NousResearch/hermes-agent (base.py, event.py, helpers.py, _shared.py, approval.py,
clarify_gateway.py).
