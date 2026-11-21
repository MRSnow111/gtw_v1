"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface AdminTableProps {
  columns: Array<{
    key: string;
    label: string;
    render?: (value: any, row: any) => ReactNode;
    className?: string;
  }>;
  data: any[];
  emptyMessage?: string;
}

export function AdminTable({ columns, data, emptyMessage }: AdminTableProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[rgba(165,187,179,0.5)]">
        {emptyMessage || "Нет данных"}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto scroll-area">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgba(220,235,230,0.08)]">
            {columns.map((col, ci) => (
              <th
                key={`${col.key}-${ci}`}
                className={cn(
                  "text-left py-3 px-4 text-xs font-medium uppercase tracking-wider text-[rgba(165,187,179,0.5)]",
                  col.className,
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.id || i}
              className="border-b border-[rgba(220,235,230,0.05)] last:border-0 transition-colors hover:bg-[rgba(143,184,174,0.04)]"
            >
              {columns.map((col, ci) => (
                <td key={`${col.key}-${ci}`} className={cn("py-3 px-4 text-[rgba(220,235,230,0.8)]", col.className)}>
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
