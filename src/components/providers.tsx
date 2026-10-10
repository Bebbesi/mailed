"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { ApiError } from "@/lib/client/api";
import { ConfirmProvider } from "./ui/confirm-dialog";
import { TooltipProvider } from "./ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (count, err) => {
              if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
              return count < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ConfirmProvider>
          {children}
          <Toaster
            position="bottom-left"
            closeButton
            toastOptions={{
              classNames: {
                toast: "!bg-ink !text-canvas !border-transparent !rounded-lg !shadow-lg !text-[13px] !font-sans",
                description: "!text-canvas/70",
                actionButton: "!bg-transparent !text-accent-soft !font-medium hover:!underline",
                cancelButton: "!bg-transparent !text-canvas/70",
                closeButton: "!bg-ink !text-canvas/70 !border-canvas/20",
              },
            }}
          />
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
