"use client";

/**
 * Ambient background — Midnight Fern.
 * Живой анимированный фон: вращающийся «аврора»-слой + дрейфующие световые пятна.
 * Контрастные альфы, чтобы движение было видно и сквозь стеклянные панели.
 * Только transform/opacity — GPU-friendly, уважает prefers-reduced-motion.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-fern-950">
      {/* базовый градиент */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(155deg, #0A1412 0%, #0E1F1B 34%, #142B26 62%, #0A1412 100%)",
        }}
      />

      {/* аврора: вращающиеся цветные переливы */}
      <div
        className="ambient-aurora absolute left-1/2 top-1/2 h-[130vmax] w-[130vmax] -translate-x-1/2 -translate-y-1/2 blur-3xl"
        style={{
          animation: "aurora-spin 45s linear infinite",
          background:
            "conic-gradient(from 40deg at 50% 50%, transparent 0deg, rgba(39,82,75,0.6) 50deg, rgba(94,208,174,0.32) 95deg, rgba(138,184,232,0.2) 135deg, rgba(77,123,115,0.45) 175deg, transparent 215deg, rgba(23,50,46,0.65) 280deg, transparent 360deg)",
          willChange: "transform",
        }}
      />

      {/* дыхание свечения */}
      <div
        className="ambient-drift absolute inset-0"
        style={{
          animation: "aurora-breathe 10s ease-in-out infinite",
          background:
            "radial-gradient(ellipse 90% 70% at 70% 20%, rgba(77,123,115,0.22), transparent 60%), radial-gradient(ellipse 80% 60% at 20% 80%, rgba(39,82,75,0.28), transparent 60%)",
        }}
      />

      {/* дрейфующие световые пятна */}
      <div
        className="ambient-drift absolute -top-[20%] -left-[10%] h-[70vw] w-[70vw] rounded-full blur-3xl"
        style={{
          animation: "drift-a 18s ease-in-out infinite alternate",
          background:
            "radial-gradient(closest-side, rgba(143,184,174,0.22), transparent 70%)",
        }}
      />
      <div
        className="ambient-drift absolute top-[30%] -right-[15%] h-[60vw] w-[60vw] rounded-full blur-3xl"
        style={{
          animation: "drift-b 24s ease-in-out infinite alternate",
          background:
            "radial-gradient(closest-side, rgba(138,184,232,0.2), rgba(77,123,115,0.25) 40%, transparent 70%)",
        }}
      />
      <div
        className="ambient-drift absolute -bottom-[25%] left-[20%] h-[55vw] w-[55vw] rounded-full blur-3xl"
        style={{
          animation: "drift-c 30s ease-in-out infinite alternate",
          background:
            "radial-gradient(closest-side, rgba(94,208,174,0.24), rgba(39,82,75,0.35) 45%, transparent 70%)",
        }}
      />

      {/* мягкое центральное свечение + виньетка для читаемости */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 42%, rgba(143,184,174,0.08), transparent 65%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% 50%, transparent 55%, rgba(5,11,10,0.45) 100%)",
        }}
      />
    </div>
  );
}
