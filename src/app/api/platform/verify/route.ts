import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { csrfViolation } from "@/lib/server/csrf";
import { clientIpOf, upstream } from "@/lib/server/gateway";
import { forwardHeaders, jsonError, noStore } from "@/lib/server/http";
import {
  clearChallenge,
  readChallenge,
  setPlatformSession,
} from "@/lib/server/platform";

export const dynamic = "force-dynamic";

const body = z
  .object({
    code: z.string().max(20).optional(),
    recovery_code: z.string().max(40).optional(),
  })
  .strict()
  .refine((b) => !!b.code || !!b.recovery_code, "Enter the code.");

interface Verified {
  access_token: string;
  expires_in: number;
  must_change_password: boolean;
  recovery_codes: string[];
}

/** Step 2: the authenticator code (or a recovery code) turns the challenge into a session. */
export async function POST(req: NextRequest) {
  const violation = csrfViolation(req);
  if (violation) return jsonError(403, violation);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(422, "Enter the code.");

  const challenge = await readChallenge(req);
  if (!challenge)
    return jsonError(401, "That took too long. Sign in again.", {
      code: "challenge_expired",
    });

  let res: Response;
  try {
    res = await upstream("/platform/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge_token: challenge, ...parsed.data }),
      clientIp: clientIpOf(req),
    });
  } catch {
    return jsonError(502, "Can't reach the server. Try again in a moment.", {
      code: "upstream_unavailable",
    });
  }
  if (!res.ok) {
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: forwardHeaders(res),
    });
  }

  const v = (await res.json()) as Verified;
  const out = NextResponse.json(
    {
      must_change_password: v.must_change_password,
      recovery_codes: v.recovery_codes ?? [],
    },
    { headers: noStore },
  );
  clearChallenge(out);
  return setPlatformSession(out, v.access_token, v.expires_in);
}
