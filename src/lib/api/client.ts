import { ApiError, parseErrorBody } from "./errors";
import type { Page } from "./types";

/**
 * Browser-side client. It only ever talks to this app's own /api/lf gateway
 * (same origin, httpOnly cookie attached by the browser) — never to the API.
 */
const BASE = "/api/lf";

type Scalar = string | number | boolean | null | undefined;
/** Array values become repeated keys (`?stage=a&stage=b`), which is how the API takes multi-value filters. */
export type Query = Record<string, Scalar | readonly Scalar[]>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Reuse the same key when retrying the same logical submission. */
  idempotencyKey?: string;
}

let redirecting = false;

/** Send the person to the login screen once, remembering where they were. */
export function redirectToLogin(reason: "expired" | "signed-out" = "expired") {
  if (typeof window === "undefined" || redirecting) return;
  redirecting = true;
  const here = window.location.pathname + window.location.search;
  const next =
    here !== "/" && !here.startsWith("/login")
      ? `&next=${encodeURIComponent(here)}`
      : "";
  // Full reload on purpose: drops every in-memory trace of the session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?reason=${reason}${next}`);
}

export function buildQuery(query?: Query): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    for (const one of Array.isArray(v) ? v : [v]) {
      if (one === undefined || one === null || one === "") continue;
      sp.append(k, String(one));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function rawRequest(
  path: string,
  opts: RequestOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-lf-csrf": "1",
  };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError({
      status: 0,
      detail: "Can't reach the server. Check your connection and try again.",
      code: "network",
    });
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.clone().json();
    } catch {
      /* non-JSON error body */
    }
    const err = parseErrorBody(res.status, body, res.headers);
    // Refresh already failed server-side by the time a 401 reaches us: the session is over.
    if (res.status === 401) redirectToLogin("expired");
    throw err;
  }
  return res;
}

export async function api<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const res = await rawRequest(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** List endpoints return a bare array and the total in `X-Total-Count`. */
export async function apiList<T>(
  path: string,
  query?: Query,
  signal?: AbortSignal,
): Promise<Page<T>> {
  const res = await rawRequest(path, { query, signal });
  const totalHeader = res.headers.get("x-total-count");
  const total =
    totalHeader !== null &&
    totalHeader !== "" &&
    Number.isFinite(Number(totalHeader))
      ? Number(totalHeader)
      : null;
  return { items: (await res.json()) as T[], total };
}

/** Local auth routes (not proxied to the API). */
export async function localPost<T = void>(
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lf-csrf": "1",
        accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError({
      status: 0,
      detail: "Can't reach the server. Check your connection and try again.",
      code: "network",
    });
  }
  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* ignore */
    }
    throw parseErrorBody(res.status, parsed, res.headers);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
