import "server-only";
import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { cookiesAreSecure, env } from "./env";
import { upstream } from "./gateway";

/**
 * The platform console's own cookies, separate from the customer session in
 * session.ts: a different name, a different encryption key and issuer, so one
 * can never be read as the other. Both are httpOnly, SameSite=Strict and (in
 * production) Secure with the `__Host-` prefix.
 *
 *  - session: the API's platform access token (no refresh token: the API ends
 *    an idle session after 30 minutes and every session after 12 hours).
 *  - challenge: the 5-minute token between the password and the two-step code.
 *    It never reaches the browser's JavaScript.
 */
export interface PlatformSession {
  /** API platform access token */
  at: string;
  /** Expiry, epoch ms (not `exp`: the sealed token's own JWT expiry uses that name) */
  until: number;
}

const ISSUER = "leadflow-web-platform";
export const PLATFORM_SESSION_MAX_AGE_S = 12 * 60 * 60;
const CHALLENGE_MAX_AGE_S = 5 * 60;

export function platformCookieName(): string {
  return cookiesAreSecure() ? "__Host-lf_platform" : "lf_platform";
}

export function challengeCookieName(): string {
  return cookiesAreSecure() ? "__Host-lf_platform_mfa" : "lf_platform_mfa";
}

function key(): Uint8Array {
  return createHash("sha256")
    .update(`leadflow-platform:${env().SESSION_SECRET}`)
    .digest();
}

async function seal(payload: Record<string, unknown>, maxAgeS: number) {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(`${maxAgeS}s`)
    .encrypt(key());
}

async function open(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key(), { issuer: ISSUER });
    return payload;
  } catch {
    return null;
  }
}

export async function readPlatformSession(
  req: NextRequest,
): Promise<PlatformSession | null> {
  const p = await open(req.cookies.get(platformCookieName())?.value);
  if (!p || typeof p.at !== "string" || typeof p.until !== "number")
    return null;
  if (p.until <= Date.now()) return null;
  return { at: p.at, until: p.until };
}

export async function readChallenge(req: NextRequest): Promise<string | null> {
  const p = await open(req.cookies.get(challengeCookieName())?.value);
  return p && typeof p.ct === "string" ? p.ct : null;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: cookiesAreSecure(),
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

export async function setPlatformSession<T extends NextResponse>(
  res: T,
  accessToken: string,
  expiresInS: number,
): Promise<T> {
  const maxAge = Math.min(expiresInS, PLATFORM_SESSION_MAX_AGE_S);
  const value = await seal(
    { at: accessToken, until: Date.now() + maxAge * 1000 },
    maxAge,
  );
  res.cookies.set(platformCookieName(), value, cookieOptions(maxAge));
  return res;
}

export function clearPlatformSession<T extends NextResponse>(res: T): T {
  res.cookies.set(platformCookieName(), "", cookieOptions(0));
  return res;
}

export async function setChallenge<T extends NextResponse>(
  res: T,
  challengeToken: string,
  expiresInS: number,
): Promise<T> {
  const maxAge = Math.min(expiresInS, CHALLENGE_MAX_AGE_S);
  res.cookies.set(
    challengeCookieName(),
    await seal({ ct: challengeToken }, maxAge),
    cookieOptions(maxAge),
  );
  return res;
}

export function clearChallenge<T extends NextResponse>(res: T): T {
  res.cookies.set(challengeCookieName(), "", cookieOptions(0));
  return res;
}

/** One call to the API's /platform/* as the signed-in platform admin. */
export function platformCall(
  session: PlatformSession,
  path: string,
  init: {
    method: string;
    headers?: HeadersInit;
    body?: ArrayBuffer | string | null;
    clientIp?: string | null;
  },
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${session.at}`);
  return upstream(path, {
    method: init.method,
    headers,
    body: init.body ?? null,
    clientIp: init.clientIp,
  });
}
