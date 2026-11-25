"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";
import { type ReactNode } from "react";

// Волна 3: обёртка @tanstack/react-query удалена — useQuery/useMutation в коде 0 (мёртвый слой).
export function Providers({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
      {children}
      <Toaster position="top-right" expand={true} richColors />
    </NextThemesProvider>
  );
}
