# GTW-плагин для Hermes gateway

Платформенный адаптер: превращает GTW (веб-чат) в платформу Hermes наравне с
Telegram/Discord. Внутри процесса gateway поднимается WebSocket-сервер
(aiohttp, только loopback), к которому подключается Next.js-фронтенд GTW
через WS-прокси `server.js`. Архитектура и маппинг событий —
`docs/architecture.md`, протокол кадров — docstring `adapter.py`.

Файлы:

| Файл | Что делает |
|---|---|
| `adapter.py` | ядро `GTWAdapter`: WS-сервер, авторизация, dispatch кадров, inbound (message → ход агента), approvals/clarify-развязка; здесь же ре-экспорт `register` |
| `isolation.py` | `IsolationMixin`: профили пользователей (multiplex), served-кэш, маршруты `profile_routes`, провизион |
| `projects.py` | `ProjectsMixin`: sandbox-home профиля, docker-cp файлов проекта, префикс контекста проекта |
| `stats.py` | `StatsMixin`: учёт хода, `session_info`/`sessions`, счётчики токенов/скорости |
| `live_browser.py` | `LiveBrowserMixin`: live-продюсер CDP (`_live_producer`) и рассылка `browser_frame` |
| `models.py` | `ModelsMixin`: каталог моделей, `set_model` (PATH A/B), разбор slug провайдера |
| `outbound.py` | `OutboundMixin`: исходящие кадры — ответы/стриминг/статусы, карточки approvals/clarify, артефакты (MEDIA) |
| `_util.py` | общий хелпер `_ms_id` (id кадров/сообщений) |
| `registration.py` | `register`/`check_requirements`/`validate_config`/`is_connected`/`_env_enablement` — регистрация в реестре плагинов |
| `plugin.yaml` | манифест плагина (name/kind/version/env) |
| `__init__.py` | обязателен загрузчику плагинов |
| `cdp_bridge.py` | TCP-мост **внутри sandbox-контейнера**: пробрасывает CDP браузера агента наружу |
| `gtw-cdp-bridge-host.py` | host-демон моста (systemd, root): принимает CDP на хосте и находит контейнер с живым Chromium |
| `gtw-cdp-bridge.service` | systemd-юнит host-демона |

End-to-end пробник лежит в `../scripts/probe.py` (вне каталога плагина, чтобы
не путать с боевыми файлами).

## Установка на хосте (где живёт Hermes)

**Пинировать коммит, а не `main`** — `curl | …/main/…` тянет неподписанный
плавающий код; на хост должен попадать конкретный SHA, тот же, что и в проде.

```bash
# 0. какой коммит ставим (боевой HEAD репозитория GTW)
GTW_REPO=git@github.com:MRSnow111/gtw_v1.git
GTW_SHA=<полный SHA закоммиченного состояния>

# 1. достать файлы плагина из нужного коммита
git clone "$GTW_REPO" /tmp/gtw-src
git -C /tmp/gtw-src checkout --detach "$GTW_SHA"
mkdir -p ~/.hermes/plugins/gtw
cp /tmp/gtw-src/plugin/{plugin.yaml,__init__.py,*.py} ~/.hermes/plugins/gtw/
cp /tmp/gtw-src/scripts/probe.py ~/gtw-probe.py     # пробник — не в каталоге плагина
rm -rf ~/.hermes/plugins/gtw/__pycache__            # старый байткод = тихая деградация

# 2. токен WS-эндпоинта (секрет; Next.js прикрепляет его к проксируемым WS)
echo "GTW_TOKEN=$(openssl rand -hex 32)" >> ~/.hermes/.env
```

```bash
# 3. авторизация: один владелец — разрешаем всех аутентифицированных GTW-сессий
echo "GTW_ALLOW_ALL_USERS=true" >> ~/.hermes/.env
# (альтернатива: GTW_ALLOWED_USERS=demo — список логинов GTW через запятую)

# 4. включить плагин и платформу
hermes plugins enable gtw-platform
hermes config set gateway.platforms.gtw.enabled true

# 5. перезапуск gateway (один на хост, обслуживает все профили)
hermes -p default gateway restart

# 6. проверка
hermes gateway status                       # в списке платформ должна появиться GTW
curl -s http://127.0.0.1:8765/health        # {"ok": true}

# 7. end-to-end пробник (health -> WS -> реальное сообщение агенту -> ответ)
python3 ~/gtw-probe.py
```

⚠️ Файлы плагина на хосте — **копия конкретного коммита**, а не рабочий clone:
после любой правки `adapter.py` **или модулей пакета** в репозитории нужно перенести все файлы на хост и
заново перезапустить gateway (и удалить `__pycache__`). Рестарт gateway обрывает
живые сессии — планировать отдельно от сборки фронта.

Пробник сам читает `GTW_TOKEN` из `~/.hermes/.env` (не печатает его), шлёт
агенту тестовое сообщение в чат `gtw-probe` и печатает ответ. Approval-запросы
отклоняет. Флаги: `--port`, `--timeout` (по умолчанию 240с), `--chat`, `--text`.

По умолчанию WS слушает `127.0.0.1:8765` (наружу не торчит). Порт/адрес
меняются через `GTW_PORT` / `GTW_BIND` в `.env` или
`gateway.platforms.gtw.extra` в config.yaml.

## Переменные окружения плагина

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `GTW_TOKEN` | — (обязательна) | shared secret WS-эндпоинта; фронт прикрепляет её в `X-GTW-Token` |
| `GTW_PORT` | `8765` | порт WS-сервера адаптера |
| `GTW_BIND` | `127.0.0.1` | адрес привязки (наружу не открывать) |
| `GTW_ALLOWED_USERS` | — | список логинов GTW через запятую |
| `GTW_ALLOW_ALL_USERS` | — | `true` — любая аутентифицированная GTW-сессия (single-owner) |
| `GTW_HOME_CHANNEL` | `main` | chat_id для cron/уведомлений |
| `GTW_BROWSER_CDP` | — | явный `ws://host/devtools/page/<id>` — фиксированная вкладка (обходит авто-поиск) |
| `GTW_BROWSER_DEBUG_PORT` | — | порт CDP-моста (в бою `9333`) |
| `GTW_BROWSER_CDP_HOST` | `127.0.0.1` | адрес CDP-моста, когда браузер агента в sandbox-контейнере |
| `GTW_BROWSER_PROFILE` | — | путь к профилю Chromium; из `<profile>/DevToolsActivePort` читается порт, если `GTW_BROWSER_DEBUG_PORT` не задан |

Имена взяты из `live_browser.py` (`_live_producer`) и `plugin.yaml` — там же
`optional_env`. Значения секретов в логи/доки не выписываются.

## live-просмотр браузера агента

Зазор: Chromium агента (`bot-desktop`) слушает CDP на **внутреннем**
`127.0.0.1:<случайный порт>` **внутри sandbox-контейнера**, а продюсер кадров
(`_live_producer` в `live_browser.py`) живёт в gateway **на хосте**. Мост состоит из
двух частей:

1. `cdp_bridge.py` — внутри контейнера: слушает `0.0.0.0:9333`
   (`GTW_BRIDGE_LISTEN_PORT`), на **каждое** подключение заново читает актуальный
   порт Chromium из `DevToolsActivePort` (`GTW_BRIDGE_PROFILE`), поэтому
   переживает перезапуск/смену порта браузера без рестарта моста.
2. `gtw-cdp-bridge-host.py` + `gtw-cdp-bridge.service` — демон на хосте (root,
   systemd, `Restart=always`): слушает `127.0.0.1:9333` на хосте, сам находит
   контейнер с живым bot-desktop Chromium (их может быть несколько — пробует
   `/json/version` через мост и берёт живой), доставляет/перезапускает в нём
   `cdp_bridge.py` и проксирует хост → контейнер. Устойчив к рестарту gateway и
   пересозданию sandbox.

Продюсер подключается к мосту по `GTW_BROWSER_CDP_HOST` +
`GTW_BROWSER_DEBUG_PORT`, адрес page-таргета перезаписывает на `host:port`
моста (Chromium отдаёт свой внутренний `127.0.0.1:<порт>`). Кадры — опрос
`Page.captureScreenshot` активной вкладки каждые ~0.35 c (не `startScreencast`:
на статичной странице он шлёт один кадр и картинка «замерзает»).

Установка моста:

```bash
# host-демон (скрипт живёт ВНЕ репозитория — юнит ссылается на ~/gtw-cdp-bridge-host.py)
install -m 0755 plugin/gtw-cdp-bridge-host.py /home/hermes/gtw-cdp-bridge-host.py
sudo cp plugin/gtw-cdp-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now gtw-cdp-bridge.service

# env продюсеру (drop-in юнита hermes-gateway.service)
mkdir -p ~/.config/systemd/user/hermes-gateway.service.d
printf '[Service]\nEnvironment=GTW_BROWSER_CDP_HOST=127.0.0.1\nEnvironment=GTW_BROWSER_DEBUG_PORT=9333\n' \
  > ~/.config/systemd/user/hermes-gateway.service.d/gtw-browser.conf
systemctl --user daemon-reload
```

Проверка: `curl -s http://127.0.0.1:9333/json/version` должен дать 200 с
`webSocketDebuggerUrl`; `systemctl status gtw-cdp-bridge.service`;
`docker exec <cid> pgrep -af cdp_bridge.py`. В UI: роль `admin` обязательна
(гейт в `server.js`), панель артефактов → режим «Браузер» → «Смотреть»
(панель видна при ширине ≥1280px).

Ограничения: продюсер подключается один раз и при обрыве шлёт
`cdp_disconnected` — авто-реконнекта нет, переподключение кнопкой «Смотреть»;
если sandbox пересоздан, а браузер агента ещё не открыт, мост ждёт
`DevToolsActivePort`; `cdp_bridge.py` слушает `0.0.0.0` внутри контейнера без
аутентификации (в этой топологии приемлемо, но при нескольких sandbox-контейнерах
на одном docker-хосте они видят CDP друг друга).

## Подключение фронта

Next.js-приложение GTW проксирует WS на `ws://127.0.0.1:8765/ws`, прикрепляя
`X-GTW-Token: <GTW_TOKEN>` на серверной стороне (браузер токен не видит).
Протокол кадров — docstring `adapter.py`.

## Что уже покрыто

- текст в обе стороны (markdown без чанкования), стриминг-draft'ы и edit/finalize;
- typing-индикатор; tool-progress приходит через `display_tier=high`;
- карточки approvals (once/session/always/deny) и clarify (включая multi-select);
- артефакты (image/document) через `MEDIA:`/`send_document`, история чата (в памяти, до 500 сообщений);
- статистика сессии (`session_info`), реестр сессий и каталог/переключение моделей (`/model`);
- изоляция пользователей по профилям Hermes + двухслойная фильтрация приватных кадров (S1);
- контекст проектов (список файлов в ходе + docker-cp fallback);
- live-просмотр браузера агента (см. выше);
- дедупликация входящих по message_id, токен-авторизация WS, heartbeat 30с.

## Ограничения v0.3

- история в памяти адаптера (переживает reconnect браузера, но не перезапуск gateway);
  персистентная история из state.db — следующий шаг;
- один WS-эндпоинт на профиль; несколько браузеров видят один поток (single-owner);
- slash-confirm — текстовым fallback'ом;
- `history`/`session_info` внутри адаптера владельца чата не проверяют
  (защита на уровне `server.js`) — defense-in-depth зарегистрирован в аудите;
- live-продюсер и `_sandbox_home`-эвристики (поиск контейнера по label
  `hermes-profile=gtw-<login>`, glob `profile_*` + mtime) завязаны на текущую
  топологию sandbox'а и могут разойтись с ядром при смене образа — см. раздел
  «Что осталось» ниже;
- host-юнит `gtw-cdp-bridge.service` ссылается на `/home/hermes/gtw-cdp-bridge-host.py`,
  т.е. на файл ВНЕ репозитория: источник — `plugin/gtw-cdp-bridge-host.py`,
  доставляется вручную (`install -m 0755` выше), при пересборке хоста юнит без
  этого файла не поднимется.

## Что осталось (зарегистрировано, не сделано)

- проверка владельца чата внутри адаптера на кадрах `history`/`session_info`
  (сейчас однослойная, на `server.js`) и роли на `browser_live`;
- персистентная история из state.db;
- авто-реконнект live-продюсера (сейчас только кнопкой «Смотреть»);
- конфиг-управляемые константы live/провизиона (сейчас модульные константы вместо литералов в теле — волна 5) и
  вынос `interval`/таймаутов в `plugin.yaml`/env — по желанию владельца.

## Тесты

- `python3 /root/gtw-test/harness.py` (песочница разработки) — проверки
  транспортного уровня: авторизация, dispatch, send/draft/edit,
  approvals/clarify, артефакты, история, stop, дедуп, register(). Стабы
  gateway-API сверены с исходниками NousResearch/hermes-agent.
- `python3 /root/gtw-test/s1_adapter_unit.py` (в репозитории — `tests/`) —
  29 проверок изоляции пользователей в `_broadcast` и гейтов.
- `python3 scripts/probe.py` на хосте — живой end-to-end (см. шаг 7).
