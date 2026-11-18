/**
 * Фон: глубокий изумруд с медленно дрейфующими световыми пятнами.
 * Без изображений — только градиенты, поэтому ничего не грузится по сети.
 */
export function AuroraBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-[10%] -top-[20%] h-[60vw] w-[60vw] max-h-[900px] max-w-[900px] animate-drift rounded-full bg-[hsl(var(--glow)/0.16)] blur-[120px]" />
      <div
        className="absolute -bottom-[25%] right-[-10%] h-[55vw] w-[55vw] max-h-[800px] max-w-[800px] animate-drift rounded-full bg-[hsl(175_70%_40%/0.14)] blur-[130px]"
        style={{ animationDelay: "-9s" }}
      />
      <div
        className="absolute left-[35%] top-[30%] h-[30vw] w-[30vw] max-h-[480px] max-w-[480px] animate-drift rounded-full bg-[hsl(140_60%_45%/0.08)] blur-[110px]"
        style={{ animationDelay: "-15s" }}
      />
      {/* тонкая сетка, затухающая к краям */}
      <div
        className="absolute inset-0 opacity-[0.5] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)/0.045) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.045) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at 50% 40%, black 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, black 20%, transparent 75%)",
        }}
      />
      {/* виньетка */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,hsl(var(--background)/0.75)_100%)]" />
    </div>
  );
}
