# Деплой GTW

Живой режим: браузер → Next-сервер (`server.js`) → WS-прокси `/ws` → GTW-адаптер
в gateway Hermes → агент. Демо-режим (`NEXT_PUBLIC_DEMO_MODE=1`) проигрывает
заготовленные ходы без шлюза — для UI-разработки.

## Топология

```
браузер ──httpOnly cookie gtw-auth──▶ server.js :3000
                                        │  /ws (upgrade только с кукой)
                                        │  подставляет GTW_TOKEN в X-GTW-Token
                                        ▼
                          GTW-адаптер ws://127.0.0.1:8765/ws
                          (плагин gateway, loopback)
                                        ▼
                                   агент Hermes
```

- `GTW_TOKEN` знает только сервер; браузеру он не выдаётся.
- WS-сервер адаптера слушает только loopback (`bind: 127.0.0.1`); наружу
  торчит лишь Next-сервер, закрытый авторизацией.
- Без куки `gtw-auth` апгрейд `/ws` отклоняется с HTTP 401.

## Переменные окружения

| Переменная | Где | По умолчанию | Назначение |
|---|---|---|---|
| `PORT` | server.js | `3000` | HTTP/WS-порт Next-сервера |
| `GTW_WS_URL` | server.js | `ws://127.0.0.1:8765/ws` | адрес WS-адаптера |
| `GTW_TOKEN` | server.js | — (обязателен) | токен апстрима, совпадает с токеном плагина |
| `NODE_ENV` | server.js | — | `production` для боевого запуска |
| `NEXT_PUBLIC_DEMO_MODE` | сборка | выкл | `1` = демо-режим (вшивается при сборке) |

На стороне gateway (плагин `gtw`, см. `plugin/README.md`):
`gateway.platforms.gtw.extra` → `token`, `port` (8765), `bind` (127.0.0.1);
либо env `GTW_TOKEN` / `GTW_PORT` / `GTW_BIND` / `GTW_ALLOW_ALL_USERS`.

## Сборка и запуск

```bash
npm ci
npm run build        # next build
npm start            # NODE_ENV=production node server.js
```

Боевой запуск с явным окружением:

```bash
PORT=3000 NODE_ENV=production \
GTW_WS_URL=ws://127.0.0.1:8765/ws \
GTW_TOKEN=<тот же токен, что в конфиге плагина> \
node server.js
```

Демо-режим (без шлюза):

```bash
NEXT_PUBLIC_DEMO_MODE=1 npm run build
npm start            # GTW_TOKEN не нужен
```

Разработка с живым шлюзом: `npm run dev:ws` (NODE_ENV=development node server.js).
Проверка живости: `curl http://127.0.0.1:3000/health` → `{"ok":true}`.

## Авторизация

- Вход: `/api/auth/login` ставит httpOnly-куку `gtw-auth` (TTL 7 дней).
- Демо-учётка: `demo` / `demo` — **сменить перед боевым деплоем**
  (`app/api/auth/login/route.ts`).
- Middleware не пускает без куки на `/chat`; `/ws` проверяет куку при апгрейде.

## Порядок ввода в бой

1. Поднять gateway с плагином `gtw` (конфиг выше), перезапустить:
   `hermes -p default gateway restart`. Проверить: `curl 127.0.0.1:8765/health`.
2. Собрать фронт без `NEXT_PUBLIC_DEMO_MODE`, запустить `server.js` с
   `GTW_TOKEN`, совпадающим с токеном плагина.
3. Сменить демо-креды, выставить наружу только порт Next-сервера
   (реверс-прокси/TLS на хосте). Порт 8765 наружу не открывать.

## E2E-проверка (песочница)

Стаб с реальным адаптером + Playwright: `/root/gtw-test/ui_stub.py`
(порт 8899), тесты `e2e_ui.py` (16 проверок) и `e2e_extra.py` (4: deny, stop,
clarify, page errors). Протокол кадров — `src/types/events.ts`;
важно: клиент→адаптер кадры идут строго TEXT-фреймами (адаптер читает
только `WSMsgType.TEXT`).
