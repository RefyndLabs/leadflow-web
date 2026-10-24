import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { csrfViolation } from "@/lib/server/csrf";
import { clientIpOf, upstream } from "@/lib/server/gateway";
import { forwardHeaders, jsonError, noStore } from "@/lib/server/http";
import { clearPlatformSession, setChallenge } from "@/lib/server/platform";

export const dynamic = "force-dynamic";

const body = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(1).max(128),
  })
  .strict();

interface Challenge {
  challenge_token: string;
  stage: "verify" | "setup";
  expires_in: number;
  secret: string | null;
  otpauth_uri: string | null;
}

/** Step 1 of the platform sign-in: the password. The challenge stays in an httpOnly cookie. */
export async function POST(req: NextRequest) {
  const violation = csrfViolation(req);
  if (violation) return jsonError(403, violation);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return jsonError(422, "Enter a valid email and password.");

  let res: Response;
  try {
    res = await upstream("/platform/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
      clientIp: clientIpOf(req),
    });
  } catch {
    return jsonError(502, "Can't reach the server. Try again in a moment.", {
      code: "upstream_unavailable",
    });
  }
  if (!res.ok) {
    // 401 (generic), 403 (address not allowed), 404 (console off), 429: passed through as they are.
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: forwardHeaders(res),
    });
  }

  const c = (await res.json()) as Challenge;
  // The authenticator set-up QR code is drawn here, so no third party ever sees the secret.
  const qr =
    c.stage === "setup" && c.otpauth_uri
      ? await QRCode.toDataURL(c.otpauth_uri, { margin: 1, width: 220 })
      : null;
  const out = NextResponse.json(
    { stage: c.stage, expires_in: c.expires_in, secret: c.secret, qr },
    { headers: noStore },
  );
  clearPlatformSession(out);
  return setChallenge(out, c.challenge_token, c.expires_in);
}
