"use client";

import { useMemo, useRef } from "react";
import { newIdempotencyKey } from "./api/client";

/**
 * One Idempotency-Key per logical submission. `get()` returns the same key on every retry of the
 * same submission; call `reset()` after success or when the person edits the form (a new submission).
 */
export function useIdempotencyKey() {
  const ref = useRef<string | null>(null);
  return useMemo(
    () => ({
      get: () => (ref.current ??= newIdempotencyKey()),
      reset: () => {
        ref.current = null;
      },
    }),
    [],
  );
}
