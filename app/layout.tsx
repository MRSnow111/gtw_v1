import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Providers } from "@/providers";

export const metadata: Metadata = {
  title: "GTW — AI Agent Gateway",
  description: "Веб-шлюз к агенту Hermes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning className="dark">
      <body
        className={`${GeistSans.variable} font-sans antialiased bg-[#0A1412]`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
