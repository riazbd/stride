"use client";

import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { StrideApp } from "@/components/app/shell";

export default function Home() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // PWA: handle ?screen=record shortcut
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("screen") === "record") {
      import("@/lib/nav").then(({ useNav }) => {
        useNav.getState().setTab("record");
      });
    }
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <StrideApp />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
