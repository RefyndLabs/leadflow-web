import "server-only";
import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import type { NextResponse } from "next/server";
import { cookiesAreSecure, env } from "./env";

/**
 * The browser only ever holds this cookie: an AES-256-GCM encrypted blob that
 * contains the API's access + refresh tokens. It is httpOnly, SameSite=Lax and
 * (in production) Secure with the `__Host-` prefix, so it can't be read by JS,
 * scoped to another domain, or set by a sibling subdomain.
 */
export interface SessionData {
  /** API access token (JWT, 15 min) */
  at: string;
  /** API refresh token (single-use, rotating) */
  rt: string;
  /** Access token expiry, epoch ms */
  ate: number;
}

export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

export function sessionCookieName(): string {
  return cookiesAreSecure() ? "__Host-lf_session" : "lf_session";
}

function key(): Uint8Array {
  return createHash("sha256").update(env().SESSION_SECRET).digest();
}

export async function sealSession(data: SessionData): Promise<string> {
  return new EncryptJWT({ ...data })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setIssuer("leadflow-web")
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .encrypt(key());
}

export async function openSession(
  token: string | undefined,
): Promise<SessionData | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key(), {
      issuer: "leadflow-web",
    });
    if (
      typeof payload.at === "string" &&
      typeof payload.rt === "string" &&
      typeof payload.ate === "number"
    ) {
      return { at: payload.at, rt: payload.rt, ate: payload.ate };
    }
    return null;
  } catch {
    return null;
  }
}

export type CookieAction =
  { kind: "none" } | { kind: "set"; session: SessionData } | { kind: "clear" };

export async function applyCookieAction<T extends NextResponse>(
  res: T,
  action: CookieAction,
): Promise<T> {
  if (action.kind === "set") {
    res.cookies.set(sessionCookieName(), await sealSession(action.session), {
      httpOnly: true,
      secure: cookiesAreSecure(),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_S,
    });
  } else if (action.kind === "clear") {
    res.cookies.set(sessionCookieName(), "", {
      httpOnly: true,
      secure: cookiesAreSecure(),
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}
