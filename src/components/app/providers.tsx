"use client";

import * as React from "react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { ApiError, describeError } from "@/lib/api/errors";
import { ConfirmProvider } from "@/components/ui/confirm";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { handled?: boolean };
  }
}

function makeClient() {
  return new QueryClient({
    queryCache: new QueryCache(),
    mutationCache: new MutationCache({
      onError: (error, _v, _c, mutation) => {
        if (mutation.meta?.handled) return; // the caller shows its own inline error
        if (error instanceof ApiError && error.status === 401) return; // redirect already in flight
        toast.error(describeError(error), { duration: 8000 });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => {
          // Never hammer on client errors or an ended session; a couple of tries for blips / 5xx.
          if (
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          )
            return false;
          return count < 2;
        },
      },
      mutations: { retry: false }, // never auto-retry writes
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <ConfirmProvider>{children}</ConfirmProvider>
      <Toaster
        position="bottom-center"
        closeButton
        mobileOffset={{ bottom: 92 }}
        toastOptions={{
          duration: 5000,
          classNames: {
            toast:
              "!rounded-[14px] !border-line !bg-surface !text-foreground !shadow-[var(--shadow-float)]",
          },
        }}
      />
    </QueryClientProvider>
  );
}
