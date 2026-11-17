import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "@/providers";
import { AmbientBackground } from "@/components/layout/AmbientBackground";

export const metadata: Metadata = {
  title: "GTW",
  description: "Веб-шлюз к AI-агенту Hermes",
};

export const viewport: Viewport = {
  themeColor: "#0A1412",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${GeistSans.variable} ${GeistMono.variable} dark`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AmbientBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
