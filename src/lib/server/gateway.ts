import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "./env";
import {
  openSession,
  sessionCookieName,
  type CookieAction,
  type SessionData,
} from "./session";

/** Refresh this long before the access token actually expires. */
const REFRESH_SKEW_MS = 60_000;
/** How long a completed refresh result is shared with late requests still carrying the old cookie. */
const REFRESH_GRACE_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 20_000;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in: number;
}

export function sessionFromTokens(t: TokenResponse): SessionData {
  return {
    at: t.access_token,
    rt: t.refresh_token,
    ate: Date.now() + t.expires_in * 1000,
  };
}

export async function readSession(
  req: NextRequest,
): Promise<SessionData | null> {
  return openSession(req.cookies.get(sessionCookieName())?.value);
}

/** Raw call to the Leadflow API. Only server code ever holds API_URL. */
export async function upstream(
  path: string,
  init: {
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
    clientIp?: string | null;
    stream?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<Response> {
  const base = env().API_URL;
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.clientIp) headers.set("x-forwarded-for", init.clientIp);
  if (/\.ngrok(-free)?\.(dev|app|io)$/i.test(new URL(base).hostname)) {
    headers.set("ngrok-skip-browser-warning", "1");
  }
  return fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body ?? undefined,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(init.timeoutMs ?? UPSTREAM_TIMEOUT_MS),
    // Node needs this to send a ReadableStream as a request body.
    ...(init.stream ? { duplex: "half" } : {}),
  } as RequestInit);
}

export function clientIpOf(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",")[0]!.trim() : null;
}

/* ── Refresh: single-flight per refresh token ────────────────────────────
 * Refresh tokens are single-use; presenting a used one revokes the whole
 * session. Many parallel requests carry the same (soon stale) cookie, so the
 * first one performs the refresh and everyone else awaits the same promise.
 * The outcome is kept for a short grace window so requests that were already
 * in flight with the old cookie reuse it instead of replaying the old token.
 *
 * This is process-local. If the frontend is ever scaled to several replicas,
 * swap `inflight` for a Redis lock keyed by the same hash (see README).
 */
export type RefreshOutcome =
  | { ok: true; session: SessionData }
  | { ok: false; reason: "rejected" | "unavailable" };

const inflight = new Map<string, Promise<RefreshOutcome>>();

async function doRefresh(refreshToken: string): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await upstream("/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  // The API returns a plain 401 for expired, invalid *and* reused tokens (no
  // distinct `token_reuse_detected` code is emitted). Any rejection therefore
  // ends the session — fail safe, never retry a rejected token.
  if (res.status === 401 || res.status === 403 || res.status === 422)
    return { ok: false, reason: "rejected" };
  if (!res.ok) return { ok: false, reason: "unavailable" };
  try {
    const body = (await res.json()) as TokenResponse;
    if (!body.access_token || !body.refresh_token)
      return { ok: false, reason: "rejected" };
    return { ok: true, session: sessionFromTokens(body) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function refreshSession(current: SessionData): Promise<RefreshOutcome> {
  const key = createHash("sha256").update(current.rt).digest("hex");
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = doRefresh(current.rt).then((outcome) => {
    const keepFor =
      outcome.ok || outcome.reason === "rejected" ? REFRESH_GRACE_MS : 0;
    const t = setTimeout(() => inflight.delete(key), keepFor);
    t.unref?.();
    return outcome;
  });
  inflight.set(key, promise);
  return promise;
}

export type GatewayResult =
  | { kind: "response"; res: Response; cookie: CookieAction }
  | { kind: "unauthorized"; cookie: CookieAction }
  | { kind: "unavailable"; cookie: CookieAction };

interface CallInit {
  method: string;
  headers?: HeadersInit;
  body?: ArrayBuffer | string | null;
  clientIp?: string | null;
}

/**
 * Calls the API on behalf of the session: refreshes proactively when the
 * access token is about to expire, and once reactively on a 401.
 */
export async function authedCall(
  session: SessionData,
  path: string,
  init: CallInit,
): Promise<GatewayResult> {
  let current = session;
  let cookie: CookieAction = { kind: "none" };
  let refreshed = false;

  const refresh = async (): Promise<GatewayResult | null> => {
    const outcome = await refreshSession(current);
    if (outcome.ok) {
      current = outcome.session;
      cookie = { kind: "set", session: current };
      refreshed = true;
      return null;
    }
    return outcome.reason === "rejected"
      ? { kind: "unauthorized", cookie: { kind: "clear" } }
      : { kind: "unavailable", cookie: { kind: "none" } };
  };

  if (current.ate - Date.now() < REFRESH_SKEW_MS) {
    const stop = await refresh();
    if (stop) return stop;
  }

  const send = () => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${current.at}`);
    return upstream(path, {
      method: init.method,
      headers,
      body: init.body ?? null,
      clientIp: init.clientIp,
    });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && !refreshed) {
      const stop = await refresh();
      if (stop) return stop;
      res = await send();
    }
  } catch {
    return { kind: "unavailable", cookie };
  }

  if (res.status === 401)
    return { kind: "unauthorized", cookie: { kind: "clear" } };
  return { kind: "response", res, cookie };
}

/** A streamed request body cannot be replayed, so a token must be valid *before* it is sent. */
const STREAM_REFRESH_SKEW_MS = 120_000;
const STREAM_TIMEOUT_MS = 120_000;

/**
 * Forwards a request body as a stream (file uploads). No retry-after-401: the access token is
 * refreshed up front when it has under two minutes left, then the request is sent exactly once.
 */
export async function authedStreamCall(
  session: SessionData,
  path: string,
  init: {
    method: string;
    headers?: HeadersInit;
    body: ReadableStream<Uint8Array> | null;
    clientIp?: string | null;
  },
): Promise<GatewayResult> {
  let current = session;
  let cookie: CookieAction = { kind: "none" };

  if (current.ate - Date.now() < STREAM_REFRESH_SKEW_MS) {
    const outcome = await refreshSession(current);
    if (!outcome.ok) {
      return outcome.reason === "rejected"
        ? { kind: "unauthorized", cookie: { kind: "clear" } }
        : { kind: "unavailable", cookie: { kind: "none" } };
    }
    current = outcome.session;
    cookie = { kind: "set", session: current };
  }

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${current.at}`);
  let res: Response;
  try {
    res = await upstream(path, {
      method: init.method,
      headers,
      body: init.body,
      clientIp: init.clientIp,
      stream: true,
      timeoutMs: STREAM_TIMEOUT_MS,
    });
  } catch {
    return { kind: "unavailable", cookie };
  }
  if (res.status === 401)
    return { kind: "unauthorized", cookie: { kind: "clear" } };
  return { kind: "response", res, cookie };
}
