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

## Доступ

- `middleware.ts`: `/admin*` без куки `gtw-auth` → редирект на `/` (общий вход).
- API-роуты `/api/admin/*` проверяют ту же куку (401 без неё).
- **Ролей пока нет**: любой вошедший пользователь видит админку. Когда бэкенд
  начнёт выдавать подписанные токены с ролью — добавить проверку в middleware
  и `requireAdmin` (заглушка в `app/api/admin/health/route.ts`).

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
