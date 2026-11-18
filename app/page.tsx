import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  BarChart3,
  Blocks,
  MessagesSquare,
  Play,
  Settings2,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/Logo";

const NAV = [
  { label: "Главная", href: "#top", active: true },
  { label: "Возможности", href: "#features" },
  // TODO: секции пока не сделаны — ссылки-заглушки
  { label: "Преимущества", href: "#" },
  { label: "О проекте", href: "#" },
  { label: "Контакты", href: "#" },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: MessagesSquare, title: "Умный чат", text: "Пишите, обсуждайте, получайте точные ответы" },
  { icon: Settings2, title: "Инструменты", text: "Автоматизируйте рутинные задачи" },
  { icon: BarChart3, title: "Аналитика", text: "Получайте инсайты и рекомендации" },
  { icon: Zap, title: "Производительность", text: "Работайте эффективнее с GTW" },
];

function Chip({
  icon: Icon,
  children,
  className,
  delay,
}: {
  icon: LucideIcon;
  children: string;
  className: string;
  delay: string;
}) {
  return (
    <div
      style={{ animationDelay: delay }}
      className={`glass animate-float absolute flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[15px] ${className}`}
    >
      <Icon className="h-[18px] w-[18px] text-primary" />
      {children}
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-[1.05] w-full max-w-[34rem]" aria-hidden="true">
      {/* орбиты */}
      <svg viewBox="0 0 500 480" className="absolute inset-0 h-full w-full overflow-visible">
        <g className="origin-center animate-orbit [transform-box:fill-box]">
          <ellipse cx="250" cy="240" rx="245" ry="105" transform="rotate(-18 250 240)" fill="none" stroke="hsl(var(--primary) / 0.35)" strokeWidth="1.2" />
          <circle cx="12" cy="285" r="4" fill="hsl(var(--primary))" />
          <circle cx="470" cy="190" r="3.5" fill="hsl(var(--primary))" />
        </g>
        <ellipse cx="250" cy="240" rx="215" ry="85" transform="rotate(14 250 240)" fill="none" stroke="hsl(var(--primary) / 0.18)" strokeWidth="1" />
      </svg>

      {/* стеклянная плита */}
      <div className="glass absolute inset-[12%] -rotate-3 rounded-[2.6rem]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="glass-inner flex h-36 w-36 items-center justify-center rounded-[2.2rem] shadow-[0_0_80px_-10px_hsl(var(--glow)/0.6)] sm:h-44 sm:w-44">
          <LogoMark className="h-20 w-20 sm:h-24 sm:w-24" />
        </div>
      </div>

      <Chip icon={Zap} className="left-[2%] top-[18%]" delay="0s">Быстро</Chip>
      <Chip icon={ShieldCheck} className="right-0 top-[11%]" delay="-2.5s">Безопасно</Chip>
      <Chip icon={Blocks} className="bottom-[10%] left-[22%]" delay="-4.5s">Гибко</Chip>
    </div>
  );
}

export default function Home() {
  return (
    <div id="top" className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col overflow-x-clip px-4 pb-6 pt-4 sm:px-8">
      {/* навигация */}
      <header className="glass flex h-16 items-center justify-between rounded-full px-5 sm:px-7">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm md:flex">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={
                item.active
                  ? "relative py-5 text-foreground after:absolute after:inset-x-0 after:bottom-3 after:h-px after:bg-primary"
                  : "text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {item.label}
            </a>
          ))}
        </nav>
        <Link href="/app" className="glass-inner flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium hover:border-primary/40">
          <ArrowUpRight className="h-4 w-4 text-primary" />
          Начать работу
        </Link>
      </header>

      {/* hero */}
      <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_1fr] lg:gap-4 lg:py-6">
        <div className="animate-fade-up">
          <div className="glass-inner inline-flex items-center gap-2.5 rounded-full py-2 pl-3.5 pr-4 text-sm">
            <span className="h-2 w-2 animate-pulse-ring rounded-full bg-primary" />
            AI-агент нового поколения
          </div>

          <h1 className="mt-8 text-[2.15rem] font-extralight leading-[1.1] tracking-tight min-[420px]:text-5xl sm:text-6xl xl:text-7xl">
            <span className="text-gradient font-light">GTW</span>
            <span className="text-muted-foreground"> — ваш</span>
            <br />
            интеллектуальный
            <br />
            веб-шлюз
          </h1>

          <p className="mt-7 max-w-lg text-lg leading-relaxed text-muted-foreground">
            Общайтесь, автоматизируйте задачи и открывайте новые возможности с мощным AI-агентом.
          </p>

          <div className="mt-9 flex items-center gap-3">
            <Link href="/app" className="btn-glow inline-flex h-14 items-center gap-3 rounded-full px-8 text-base font-medium">
              <Play className="h-4 w-4 fill-current" />
              Узнать больше
            </Link>
            <a
              href="#features"
              aria-label="Прокрутить вниз"
              className="glass-inner flex h-14 w-14 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <ArrowDown className="h-5 w-5" />
            </a>
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:150ms]">
          <HeroVisual />
        </div>
      </section>

      {/* полоса возможностей */}
      <section id="features" className="glass grid grid-cols-2 gap-y-6 rounded-[2rem] p-6 lg:grid-cols-4 lg:p-7">
        {FEATURES.map(({ icon: Icon, title, text }, i) => (
          <div
            key={title}
            className={`flex items-start gap-4 px-2 lg:px-6 ${i > 0 ? "lg:border-l lg:border-border/70" : ""}`}
          >
            <Icon className="mt-0.5 h-7 w-7 shrink-0 text-primary" strokeWidth={1.5} />
            <div>
              <div className="font-medium">{title}</div>
              <div className="mt-1 text-sm leading-snug text-muted-foreground">{text}</div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
