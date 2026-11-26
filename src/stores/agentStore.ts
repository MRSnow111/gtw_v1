"use client";

import { useLiveStore } from "@/stores/liveStore";

/**
 * Единая точка доступа компонентов к чату.
 * LIVE (по умолчанию): реальный WS-поток gtw-адаптера через прокси /ws.
 * DEMO: NEXT_PUBLIC_DEMO_MODE=1 — проигрывание демо-ходов (чистый UI-дев без шлюза).
 *
 * Волна 5 K6: demoStore подключается require-ом внутри ветки с инлайн-условием
 * env — в прод-сборке (NEXT_PUBLIC_DEMO_MODE != "1") бандлер вырезает мёртвую
 * ветку, и демо-код (demoStore + demoSeeds) не попадает в бандл.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export const useAgentStore =
  process.env.NEXT_PUBLIC_DEMO_MODE === "1"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- намеренный require в env-ветке: прод-сборка алиасит demoStore на стаб (next.config.mjs, K6)
      (require("@/stores/demoStore") as typeof import("@/stores/demoStore")).useDemoStore
    : useLiveStore;
