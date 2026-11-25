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
| `GTW_LOGIN` / `GTW_PASSWORD` | app/api/auth/login/route.ts, server.js | `demo` / — | аккаунт владельца (роль `admin`). **В production вход без `GTW_PASSWORD` запрещён** (500 `config_error`) — demo/demo в бою не работает |
| `GTW_USER_LOGIN` / `GTW_USER_PASSWORD` | app/api/auth/login/route.ts | — | опциональный аккаунт пользователя (роль `user`, только чат) |
| `GTW_AUTH_SECRET` | server.js | = `GTW_TOKEN` | секрет подписи сессионной куки; в production запуск без явного секрета прерывается (S11) |
| `GTW_DATA_DIR` | server.js | `<cwd>/data` | каталог данных: SQLite-БД `gtw.db` (пользователи, лимиты, события) |
| `GTW_FILESTORE_DIR` | server.js | `<GTW_DATA_DIR>/filestore` | хранилище загруженных файлов/артефактов; корень проверки путей `storage_path` (S7) |
| `GTW_FILES_DIR` | app/api/admin/files/route.ts | `<GTW_DATA_DIR>/files` | корень файлового менеджера `/admin/files` |
| `GTW_ARTIFACT_ROOTS` | server.js | — | `:`-список доп. корней артефактов (для бенча/тестов) |
| `HERMES_HOME` | server.js | `~/.hermes` | корень Hermes: источники артефактов для предпросмотра |

Требуется **Node ≥ 22.13** (встроенный `node:sqlite` без флага; на хосте
v22.22.1 — подходит). Каталог `data/` создаётся автоматически при первом
обращении, в git не попадает (`.gitignore`). Бэкап пользователей = копия
`data/gtw.db`.

Роли и защита админки — `docs/admin.md`. После обновления со старых кук
(`mock.<ts>`) нужен повторный вход.

На стороне gateway (плагин `gtw`, см. `plugin/README.md`): токен обычно лежит
в `~/.hermes/.env` строкой `GTW_TOKEN=...` (либо
`gateway.platforms.gtw.extra.token` в конфиге); порт/бинд —
`gateway.platforms.gtw.extra` → `port` (8765), `bind` (127.0.0.1), либо env
`GTW_PORT` / `GTW_BIND` / `GTW_ALLOW_ALL_USERS`. Скопировать токен в `gtw.env`,
не печатая: `grep '^GTW_TOKEN=' ~/.hermes/.env >> ~/gtw.env`.

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

Проверка живости: **отдельного `/health` у фронт-сервера нет**. Есть
админ-гейченный `GET /api/admin/health` (нужна кука `gtw-auth` с ролью `admin`;
curl без куки получит 401) — он отдаёт счётчики сессий и TCP-пробу WS-порта
плагина. Для внешнего healthcheck'а: `curl -I http://127.0.0.1:3000/`
(200/302) плюс проба апстрима `curl -s http://127.0.0.1:8765/health` →
`{"ok":true}` — это эндпоинт уже адаптера, loopback.

## systemd (боевой запуск)

Фронт держится пользовательским юнитом `gtw.service` (пользователь `hermes`,
WorkingDirectory = рабочий клон репозитория). Секреты — **только** из
`EnvironmentFile`, в самом юните их не писать:

`~/.config/systemd/user/gtw.service`:

```ini
[Unit]
Description=GTW web gateway (Next.js + WS proxy)
After=network-online.target

[Service]
WorkingDirectory=/home/hermes/gtw_v1
EnvironmentFile=/home/hermes/gtw.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

`~/gtw.env` (`chmod 600`, в git не попадает; переменные — см. таблицу выше):

```bash
GTW_TOKEN=…            # тот же, что у плагина в ~/.hermes/.env
GTW_AUTH_SECRET=…
GTW_LOGIN=…
GTW_PASSWORD=…
GTW_WS_URL=ws://127.0.0.1:8765/ws
GTW_DATA_DIR=/home/hermes/gtw-data
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now gtw.service
systemctl --user status gtw.service --no-pager
```

Лог: `journalctl --user -u gtw.service -n 50`. Либо lingering, либо
`loginctl enable-linger hermes`, иначе сервис не переживёт logout/ребут.

**После каждой `npm run build` обязателен рестарт**: `systemctl --user restart
gtw.service`. `server.js` отдаёт собранный `.next` из своего процесса, поэтому
без рестарта браузер получает stale-build (500 на ассетах) — это ловилось в бою
неоднократно.

## Авторизация

- Вход: `/api/auth/login` ставит httpOnly-куку `gtw-auth` (подписанный токен с
  ролью, TTL 7 дней).
- **Креды — только через окружение**: `GTW_LOGIN`/`GTW_PASSWORD` (владелец,
  роль `admin`), опционально `GTW_USER_LOGIN`/`GTW_USER_PASSWORD` (роль `user`).
  Править `app/api/auth/login/route.ts` под боевые пароли не нужно и нельзя —
  секреты не должны попадать в репозиторий. В production без `GTW_PASSWORD`
  вход отдаёт 500 `config_error` (демо-входа `demo`/`demo` в бою нет; он жив
  только в dev).
- Обычные пользователи заводятся в админке (`/admin/users`), хранятся в
  SQLite `GTW_DATA_DIR/gtw.db` (scrypt-хэши).
- Middleware не пускает без куки на `/chat`; `/ws` проверяет куку при апгрейде
  (плюс сверка с живой учёткой, Origin и роль — фиксы волны 1).
- После обновления формата куки (`mock.<ts>` со старых версий) нужен повторный вход.

## Порядок ввода в бой

1. Поднять gateway с плагином `gtw` (конфиг и установка — `plugin/README.md`),
   перезапустить gateway. Проверить: `curl -s 127.0.0.1:8765/health` →
   `{"ok":true}` (у самого Next-сервера `/health` нет — см. выше).
2. Собрать фронт без `NEXT_PUBLIC_DEMO_MODE` и запустить `server.js` под
   `gtw.service` с `GTW_TOKEN`/`GTW_AUTH_SECRET`/`GTW_LOGIN`/`GTW_PASSWORD` из
   `EnvironmentFile` (`GTW_TOKEN` обязан совпадать с токеном плагина).
3. Убедиться, что наружу торчит только порт Next-сервера (реверс-прокси/TLS на
   хосте). Порт 8765 наружу не открывать; `GTW_BIND` оставить `127.0.0.1`.
4. Проверить вход в UI (роль `admin` у владельца), отправку сообщения и
   `/api/admin/health`.
5. Если нужен live-просмотр браузера агента — поднять host-мост
   `gtw-cdp-bridge.service` и задать env продюсеру (раздел «live-браузер» в
   `plugin/README.md`).

## Траблшутинг

- **`npm ci` → ERR_SOCKET_TIMEOUT** (частое с РФ-IP): поднять таймауты
  (`npm config set fetch-timeout 300000`, `fetch-retries 5`) или использовать
  зеркало: `npm ci --registry=https://registry.npmmirror.com`.
- **Caddy не стартует**: адрес сайта без двоеточия — `mimiric.ru {`, а не
  `:mimiric.ru {` (остаётся от дефолтного `:80`). Проверка:
  `sudo caddy validate --config /etc/caddy/Caddyfile`; на незапущенном
  сервисе `reload` падает — нужен `restart`.
- **Вход проходит, но чат не подключается (401 на /ws)**: кука `gtw-auth`
  имеет флаг Secure и по обычному HTTP не принимается браузером. Нужен HTTPS
  (Caddy) либо проверка через `http://localhost:3000` (SSH-туннель
  `ssh -L 3000:127.0.0.1:3000 hermes@<host>`).
- **Ход «зависает» без ошибок**: клиент→адаптер кадры должны идти TEXT-фреймами
  (адаптер читает только `WSMsgType.TEXT`, binary молча отбрасывается).
- **Браузер: `SSL_ERROR_INTERNAL_ERROR_ALERT` на `www.mimiric.ru`**: в Caddyfile
  перечислены оба имени, иначе для `www` нет сертификата и Caddy шлёт TLS alert
  internal error. Строка сайта: `mimiric.ru, www.mimiric.ru {`. Быстрый фикс:
  `sudo sed -i 's/^mimiric\.ru {/mimiric.ru, www.mimiric.ru {/' /etc/caddy/Caddyfile`
  затем `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
  Сертификат для `www` Caddy получит сам (порт 80 должен быть открыт).

## E2E-проверка (песочница)

Стаб с реальным адаптером + Playwright: `/root/gtw-test/ui_stub.py`
(порт 8899), тесты `e2e_ui.py` (16 проверок) и `e2e_extra.py` (4: deny, stop,
clarify, page errors). Протокол кадров — `src/types/events.ts`;
важно: клиент→адаптер кадры идут строго TEXT-фреймами (адаптер читает
только `WSMsgType.TEXT`).
