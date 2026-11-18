import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
import { Providers } from "@/providers";
import { AuroraBackground } from "@/components/brand/AuroraBackground";

export const metadata: Metadata = {
  title: "GTW — интеллектуальный веб-шлюз",
  description: "Веб-шлюз к AI-агенту: чат, инструменты и артефакты в одном окне",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased">
        <AuroraBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
