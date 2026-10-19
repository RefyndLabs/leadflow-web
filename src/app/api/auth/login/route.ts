import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { csrfViolation } from "@/lib/server/csrf";
import {
  clientIpOf,
  sessionFromTokens,
  upstream,
  type TokenResponse,
} from "@/lib/server/gateway";
import { forwardHeaders, jsonError } from "@/lib/server/http";
import { applyCookieAction } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const body = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(1).max(128),
  })
  .strict();

export async function POST(req: NextRequest) {
  const violation = csrfViolation(req);
  if (violation) return jsonError(403, violation);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return jsonError(422, "Enter a valid email and password.");

  const ip = clientIpOf(req);
  let login: Response;
  try {
    login = await upstream("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
      clientIp: ip,
    });
  } catch {
    return jsonError(502, "Can't reach the server. Try again in a moment.", {
      code: "upstream_unavailable",
    });
  }

  if (!login.ok) {
    // 401 (generic) / 429 (with Retry-After) pass through untouched — never hint at which part was wrong.
    const text = await login.text();
    return new NextResponse(text, {
      status: login.status,
      headers: forwardHeaders(login),
    });
  }

  const tokens = (await login.json()) as TokenResponse;
  const session = sessionFromTokens(tokens);

  let me: Response;
  try {
    me = await upstream("/auth/me", {
      headers: { authorization: `Bearer ${session.at}` },
      clientIp: ip,
    });
  } catch {
    return jsonError(
      502,
      "Signed in, but the profile could not be loaded. Try again.",
      {
        code: "upstream_unavailable",
      },
    );
  }
  if (!me.ok)
    return jsonError(
      502,
      "Signed in, but the profile could not be loaded. Try again.",
    );

  const res = NextResponse.json(await me.json(), {
    headers: { "cache-control": "no-store" },
  });
  return applyCookieAction(res, { kind: "set", session });
}
