# Админ-панель GTW (`/admin`)

Перенесена из ветки `admin-panel` (коммит `c95b7f9`) и приведена к боевому
дизайну Midnight Fern: те же плавающие стеклянные панели (`glass-strong` +
`glass-edge`, `rounded-[28px]`), общий фон `AmbientBackground`, шапка сайдбара
как в основном чате. На мобильных (<768px) навигация — горизонтальные чипы.

## Секции

| Путь | Что показывает |
|---|---|
| `/admin` | дашборд: пользователи, сессии, плагины, ошибки, изменения конфига, аптайм |
| `/admin/config` | настройки gateway (ключи и значения) |
| `/admin/users` | пользователи и роли |
| `/admin/plugins` | плагины агента |
| `/admin/sessions` | сессии |
| `/admin/files` | файлы |
| `/admin/logs` | логи |

Вход — из основного сайдбара: пункт «Админ-панель» над футером.

## Доступ и роли

Кука `gtw-auth` — **подписанный токен** `v1.<payload>.<HMAC-SHA256>` с полями
`login`, `role` (`admin` | `user`), `exp` (7 дней). Секрет подписи:
`GTW_AUTH_SECRET`, иначе `GTW_TOKEN` (уже есть в `gtw.env`). Формат проверяют
middleware, API-роуты и `server.js` (апгрейд `/ws`). Старые куки `mock.<ts>`
недействительны — после обновления нужен повторный вход.

Аккаунты из env:

| Аккаунт | Env | Роль |
|---|---|---|
| владелец | `GTW_LOGIN` / `GTW_PASSWORD` | `admin` — видит админку |
| пользователь (опционально) | `GTW_USER_LOGIN` / `GTW_USER_PASSWORD` | `user` — только чат |

- `middleware.ts`: без валидной куки `/chat*` и `/admin*` → редирект на `/`;
  валидная, но роль не `admin` на `/admin*` → редирект в `/chat`.
- `/api/admin/*`: 401 без валидной куки, 403 для роли `user` (`src/lib/adminAuth.ts`).
- Ссылка «Админ-панель» в сайдбаре рендерится только при роли `admin`;
  роль клиент сверяет через `GET /api/auth/me` (не доверяет localStorage).

## Данные — MVP-моки

Все данные приходят из `src/data/mockAdminData.ts` через роуты `app/api/admin/*`;
POST/DELETE возвращают `{ok:true}` без реальных изменений. Это намеренно:
интерфейс готов, подключение реальных данных — следующий шаг:

- health/аптайм/сессии — из gateway (плагин gtw, `127.0.0.1:8765`);
- плагины — `hermes plugins list`;
- конфиг — `~/.hermes/config.yaml` (осторожно: секреты не отдавать в UI);
- логи — journalctl gateway / лог-файлы.

## Компоненты

- `src/components/admin/`: AdminSidebar, AdminCard, AdminTable, AdminModal, StatusBadge
- `src/components/ui/`: GlassCard, GlassButton (primary = `gradient-primary`,
  как кнопка входа), GlassInput
- типы: `src/types/admin.ts`
