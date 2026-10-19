"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Value = string | number | null | undefined;

/** Filter/pagination state that lives in the URL, so views are shareable and survive refresh/back. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const get = useCallback((key: string) => sp.get(key) ?? "", [sp]);
  const getAll = useCallback((key: string) => sp.getAll(key), [sp]);

  /** An array value replaces every occurrence of the key (`?stage=a&stage=b`); empty/null removes it. */
  const set = useCallback(
    (
      patch: Record<string, Value | readonly string[]>,
      opts: { keepSkip?: boolean } = {},
    ) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        next.delete(k);
        if (Array.isArray(v)) {
          for (const one of v) if (one !== "") next.append(k, one);
        } else if (v !== null && v !== undefined && v !== "") {
          next.set(k, String(v));
        }
      }
      if (!opts.keepSkip && !("skip" in patch)) next.delete("skip"); // any filter change returns to page one
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, sp],
  );

  /** Adds or removes one value of a multi-value key. */
  const toggle = useCallback(
    (key: string, value: string) => {
      const current = sp.getAll(key);
      set({
        [key]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      });
    },
    [sp, set],
  );

  /** Replaces the whole query string (saved views, "Clear all"). */
  const replaceAll = useCallback(
    (params: Record<string, string | readonly string[]>) => {
      const next = new URLSearchParams();
      for (const [k, v] of Object.entries(params))
        for (const one of Array.isArray(v) ? v : [v]) next.append(k, one);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const skip = Math.max(0, Number.parseInt(sp.get("skip") ?? "0", 10) || 0);
  return { get, getAll, set, toggle, replaceAll, skip, params: sp };
}
