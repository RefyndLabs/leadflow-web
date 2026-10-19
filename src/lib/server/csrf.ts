import "server-only";
import type { NextRequest } from "next/server";
import { env } from "./env";

/**
 * CSRF defence for cookie-authenticated state-changing routes. Three layers:
 *  1. SameSite=Lax on the session cookie (set in session.ts)
 *  2. Origin (or Sec-Fetch-Site) must match this app
 *  3. A custom header that cross-site forms cannot send and that forces a
 *     CORS preflight for cross-site fetches
 */
export const CSRF_HEADER = "x-lf-csrf";

function allowedHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) hosts.add(host.toLowerCase());
  for (const o of (env().ALLOWED_ORIGINS ?? "").split(",")) {
    const t = o.trim();
    if (!t) continue;
    try {
      hosts.add(new URL(t).host.toLowerCase());
    } catch {
      /* ignore malformed entry */
    }
  }
  return hosts;
}

export function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

/** Returns an error message when the request should be refused, otherwise null. */
export function csrfViolation(req: NextRequest): string | null {
  if (isSafeMethod(req.method)) return null;
  if (req.headers.get(CSRF_HEADER) !== "1") return "Missing CSRF header";
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none")
    return "Cross-site request refused";
  const origin = req.headers.get("origin");
  if (!origin) return "Missing Origin header";
  try {
    if (!allowedHosts(req).has(new URL(origin).host.toLowerCase()))
      return "Origin not allowed";
  } catch {
    return "Invalid Origin header";
  }
  return null;
}
