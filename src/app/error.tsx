"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <h1 className="text-[26px] font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          The problem has been logged. Try again, and if it keeps happening tell
          your admin.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted">
            ref {error.digest}
          </p>
        )}
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
