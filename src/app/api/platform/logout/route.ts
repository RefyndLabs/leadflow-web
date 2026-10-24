import { NextResponse, type NextRequest } from "next/server";
import { csrfViolation } from "@/lib/server/csrf";
import { clientIpOf } from "@/lib/server/gateway";
import { jsonError, noStore } from "@/lib/server/http";
import {
  clearChallenge,
  clearPlatformSession,
  platformCall,
  readPlatformSession,
} from "@/lib/server/platform";

export const dynamic = "force-dynamic";

/** Ends the platform session in the API (best effort) and always clears the cookies. */
export async function POST(req: NextRequest) {
  const violation = csrfViolation(req);
  if (violation) return jsonError(403, violation);

  const session = await readPlatformSession(req);
  if (session) {
    try {
      await platformCall(session, "/platform/auth/logout", {
        method: "POST",
        clientIp: clientIpOf(req),
      });
    } catch {
      /* the cookie is cleared regardless */
    }
  }
  const res = new NextResponse(null, { status: 204, headers: noStore });
  clearChallenge(res);
  return clearPlatformSession(res);
}
