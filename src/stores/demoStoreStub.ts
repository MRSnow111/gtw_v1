/**
 * Волна 5 K6: прод-заглушка demoStore.
 * В прод-сборке next.config.mjs алиасит "@/stores/demoStore" на этот файл,
 * поэтому реальный demoStore + demoSeeds не попадают в бандл. Ветка DEMO_MODE
 * в agentStore при NEXT_PUBLIC_DEMO_MODE != "1" никогда не выбирается, так что
 * заглушке достаточно быть валидным модулем с тем же именем экспорта.
 */
export { useLiveStore as useDemoStore } from "./liveStore";
