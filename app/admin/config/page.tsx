"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { Settings, FileCode2 } from "lucide-react";

/**
 * Волна 4 (A3): страница больше не показывает фейковый каталог настроек и
 * не делает фиктивный POST с тостом «успех». Конфигурация шлюза живёт в
 * env-файле на сервере; API /api/admin/config отвечает честный 501.
 */
export default function AdminConfigPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Настройки</h1>
        <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
          Конфигурация шлюза
        </p>
      </div>

      <AdminCard variant="light" className="!p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 h-10 w-10 rounded-xl bg-[rgba(240,192,64,0.12)] flex items-center justify-center">
            <Settings className="h-5 w-5 text-[#F0C040]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-[rgba(220,235,230,0.85)]">
              Конфигурация gateway задаётся env-файлом на сервере и не редактируется через веб.
            </p>
            <p className="text-xs text-[rgba(165,187,179,0.55)] mt-2 leading-relaxed">
              Параметры (GTW_LOGIN, GTW_PASSWORD, GTW_TOKEN, GTW_WS_URL, GTW_DATA_DIR и др.)
              находятся в env-файле сервиса; их меняет владелец сервера, после чего служба
              перезапускается. Через веб-админку изменения не применяются — API отвечает
              «not_implemented», чтобы не создавать иллюзию сохранения.
            </p>
            <div className="flex items-center gap-2 mt-3 text-[11px] text-[rgba(165,187,179,0.4)] font-mono">
              <FileCode2 className="h-3.5 w-3.5" />
              <span>GET/POST /api/admin/config → 501 not_implemented</span>
            </div>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
