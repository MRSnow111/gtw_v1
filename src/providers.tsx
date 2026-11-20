"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import { type ReactNode, useState } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  // v1 — только тёмная тема (docs/design.md §7): класс .dark хардкодит layout,
  // ThemeProvider здесь создавал бы иллюзию переключателя. Вернётся со светлой темой.
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-right" expand={true} richColors />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
