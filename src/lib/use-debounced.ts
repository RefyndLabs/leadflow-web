"use client";

import * as React from "react";

/** Delays a fast-changing value (typing) so it can drive a request without firing on every keystroke. */
export function useDebounced<T>(value: T, ms = 600): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
