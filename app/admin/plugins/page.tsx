"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { Puzzle, TerminalSquare } from "lucide-react";

/**
 * Волна 4 (A3): мок-каталог «плагинов gateway» и фиктивный toggle с тостом
 * «успех» удалены. Плагинами управляет владелец через CLI на сервере;
 * API /api/admin/plugins отвечает честный 501.
 */
export default function AdminPluginsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[rgba(220,235,230,0.95)]">Плагины</h1>
        <p className="text-sm text-[rgba(165,187,179,0.6)] mt-1">
          Расширения шлюза
        </p>
      </div>

      <AdminCard variant="light" className="!p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 h-10 w-10 rounded-xl bg-[rgba(176,136,212,0.12)] flex items-center justify-center">
            <Puzzle className="h-5 w-5 text-[#B088D4]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-[rgba(220,235,230,0.85)]">
              Управление плагинами — через CLI hermes plugins на сервере.
            </p>
            <p className="text-xs text-[rgba(165,187,179,0.55)] mt-2 leading-relaxed">
              Список, подключение и отключение плагинов (включая адаптер GTW) выполняет
              владелец сервера; смена кода адаптера требует перезапуска gateway. В веб-админке
              нет переключателей, которые ничего не меняют, — API отвечает «not_implemented».
            </p>
            <div className="flex items-center gap-2 mt-3 text-[11px] text-[rgba(165,187,179,0.4)] font-mono">
              <TerminalSquare className="h-3.5 w-3.5" />
              <span>GET/POST /api/admin/plugins → 501 not_implemented</span>
            </div>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
