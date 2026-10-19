"use client";

import { useState } from "react";
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ApiError, describeError } from "./api/errors";

/** RHF + Zod with validation that starts after first blur, then updates as you type (HIG › Entering data). */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  defaultValues: DefaultValues<z.input<S>>,
) {
  return useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema as never) as never,
    defaultValues,
    mode: "onTouched",
  });
}

/**
 * Maps an API failure onto a form. Field-level 422 issues land on their inputs; anything else
 * (409 conflict, 403, network) is returned as a message for an inline banner.
 */
export function applyApiError<T extends FieldValues>(
  form: UseFormReturn<T, unknown, never>,
  err: unknown,
  aliases: Record<string, string> = {},
): string | null {
  if (err instanceof ApiError && err.status === 422 && err.fields.length > 0) {
    let unmatched: string | null = null;
    const names = new Set(Object.keys(form.getValues()));
    for (const issue of err.fields) {
      const leaf = issue.path.split(".").pop() ?? "";
      const name =
        aliases[issue.path] ??
        aliases[leaf] ??
        (names.has(leaf) ? leaf : names.has(issue.path) ? issue.path : null);
      if (name)
        form.setError(name as Path<T>, {
          type: "server",
          message: issue.message,
        });
      else
        unmatched = issue.path
          ? `${issue.path}: ${issue.message}`
          : issue.message;
    }
    if (unmatched) return unmatched;
    form.setFocus(
      (Object.keys(form.formState.errors)[0] ??
        Object.keys(form.getValues())[0]) as Path<T>,
    );
    return null;
  }
  return describeError(err);
}

/** Small helper: banner message state that clears on the next submit. */
export function useFormBanner() {
  const [banner, setBanner] = useState<string | null>(null);
  return { banner, setBanner, clear: () => setBanner(null) };
}
