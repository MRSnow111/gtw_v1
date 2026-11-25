# GTW — веб-шлюз к Hermes

GTW (Gateway To Hermes) — веб-чат поверх Hermes gateway. Браузер соединяется с
**кастомным Node-сервером** (`server.js`), который поднимает Next.js 16 и
одновременно проксирует WebSocket `/ws` на WS-сервер платформенного плагина
GTW внутри Hermes gateway (`ws://127.0.0.1:8765/ws`). Токен апстрима
(`GTW_TOKEN`) подставляется на серверной стороне в заголовок `X-GTW-Token` —
браузер его никогда не видит. Авторизация входа — httpOnly-кука `gtw-auth`.

## Стек (по факту кода)

- **Next.js 16** (App Router) + **кастомный `server.js`** (Next-хендлер + WS-прокси на `ws`);
- **React 19**, **TypeScript 5.9**;
- **Zustand 4** — клиентский стейт (`src/stores/*`, живой чат-стор — `src/stores/liveStore.ts`);
- **Tailwind CSS 3** (+ `tailwindcss-animate`), UI-компоненты собственные (`src/components/ui`);
- **`ws` 8** — WS-прокси в `server.js`; **`node:sqlite`** — локальная БД (`data/gtw.db`);
- Real-time — **нативный WebSocket**, без socket.io;
- Сторона gateway — **плагин Hermes** `plugin/` (Python, aiohttp), см. `plugin/README.md`.

Библиотек `socket.io-client`, `shadcn/ui`, `@tanstack/react-query`,
`react-dropzone`, `zod` в коде **нет** — старые версии этого README их ошибочно
приписывали себе.

## Требования

- **Node.js ≥ 22.13** — нужен встроенный `node:sqlite` (без флага);
- npm;
- запущенный Hermes gateway с включённым плагином `gtw` (для живого режима).

## Установка

```bash
git clone <репозиторий GTW> && cd gtw_v1
npm install
```

## Переменные окружения

Фронт/сервер (`server.js`, API-роуты):

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `3000` | HTTP + WS-порт сервера |
| `NODE_ENV` | — | `production` для боевого запуска |
| `GTW_WS_URL` | `ws://127.0.0.1:8765/ws` | адрес WS-сервера плагина |
| `GTW_TOKEN` | — (обязателен в проде) | токен апстрима, совпадает с токеном плагина |
| `GTW_AUTH_SECRET` | `= GTW_TOKEN` | секрет подписи куки `gtw-auth`; в проде без него сервер не стартует |
| `GTW_LOGIN` / `GTW_PASSWORD` | `demo` / — | учётка владельца (роль `admin`); в проде без `GTW_PASSWORD` вход запрещён |
| `GTW_USER_LOGIN` / `GTW_USER_PASSWORD` | — | опциональная учётка обычного пользователя (роль `user`) |
| `GTW_DATA_DIR` | `<cwd>/data` | каталог данных: SQLite `gtw.db` (пользователи, лимиты, события) |
| `GTW_FILESTORE_DIR` | `<GTW_DATA_DIR>/filestore` | хранилище файлов чата/артефактов |
| `GTW_FILES_DIR` | `<GTW_DATA_DIR>/files` | корень файлового менеджера `/admin/files` |
| `GTW_ARTIFACT_ROOTS` | — | `:`-список доп. корней артефактов (бенч/тесты) |
| `HERMES_HOME` | `~/.hermes` | корень Hermes для путей артефактов |
| `NEXT_PUBLIC_DEMO_MODE` | выкл | `1` — демо-режим без шлюза (вшивается при сборке) |

Плагин gateway (`plugin/adapter.py`): `GTW_TOKEN` (обязателен), `GTW_PORT`
(`8765`), `GTW_BIND` (`127.0.0.1`), `GTW_ALLOWED_USERS`, `GTW_ALLOW_ALL_USERS`,
`GTW_HOME_CHANNEL`, плюс live-browser переменные — список и смысл в
`plugin/README.md` и `plugin/plugin.yaml`.

Значения секретов нигде не печатаются: креды задаются через окружение
(`EnvironmentFile` у systemd), а не правкой файлов в репозитории.

## Сборка и запуск

```bash
npm install
npm run build        # next build
node server.js       # или npm start (NODE_ENV=production node server.js)
```

Разработка:

```bash
npm run dev          # next dev (без WS-прокси)
npm run dev:ws       # NODE_ENV=development node server.js (с WS-прокси)
npm run lint         # ESLint (конфиг eslint.config.mjs)
```

После `npm run build` на боевом хосте **обязательно** рестарт фронтового
сервиса (`systemctl --user restart gtw.service`) — иначе отдаётся stale-build.
Подробности деплоя и траблшутинг: `docs/deploy.md`.

## Архитектура

```
браузер ──HTTPS──▶ server.js (Next 16 + WS-прокси)
                     │  httpOnly-кука gtw-auth, роль, Origin, сверка с БД (S4)
                     │  /ws → подставляет GTW_TOKEN в X-GTW-Token
                     ▼
        gtw-адаптер (плагин Hermes gateway, aiohttp WS, только loopback :8765)
                     ▼
              Hermes gateway → агент (сессии, инструменты, approvals)
```

- Протокол кадров — docstring `plugin/adapter.py`; типы во фронте — `src/types/events.ts`.
- Плагин (`plugin/`): текст/стриминг-draft, approvals и clarify-карточки,
  артефакты (MEDIA), история чата, статистика сессии, каталог и переключение
  моделей, изоляция пользователей по профилям Hermes, live-просмотр браузера агента.
- Админка (`/admin`) и её эндпоинты — `docs/admin.md` (`GET /api/admin/health`,
  отдельного публичного `/health` у фронта нет).

## Структура репозитория

```
├── app/                # Next.js App Router (страницы + API-роуты)
├── src/                # компоненты, сторы Zustand, либы, типы
├── server.js           # кастомный сервер: Next + WS-прокси /ws + гейты W1
├── middleware.ts       # гейт неаутентифицированных путей
├── plugin/             # Hermes-плагин gtw (adapter.py, cdp_bridge.py, plugin.yaml)
├── scripts/            # probe.py — end-to-end пробник плагина
├── docs/               # deploy.md, admin.md, architecture.md, design.md, pages.md
├── tests/              # s1_adapter_unit.py, e2e_ws_isolation.py
└── docker/             # sandbox-office.Dockerfile
```

## Лицензия

Файла лицензии в репозитории нет; пакет помечен `"private": true`. Все права
принадлежат автору (MRSnow111).
