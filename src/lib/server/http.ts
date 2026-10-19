import "server-only";
import { NextResponse } from "next/server";

export const noStore = { "cache-control": "no-store" } as const;

export function jsonError(
  status: number,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    { detail, ...extra },
    { status, headers: { ...noStore } },
  );
}

/** Response headers worth forwarding from the API to the browser. */
const FORWARD = [
  "content-type",
  "x-total-count",
  "x-request-id",
  "retry-after",
];

export function forwardHeaders(res: Response): Headers {
  const out = new Headers({ ...noStore });
  for (const name of FORWARD) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  return out;
}
