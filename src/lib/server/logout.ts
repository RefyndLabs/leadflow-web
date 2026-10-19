import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { csrfViolation } from "./csrf";
import { authedCall, clientIpOf, readSession } from "./gateway";
import { jsonError, noStore } from "./http";
import { applyCookieAction } from "./session";

/** Ends the API session (best effort) and always clears the browser cookie. */
export async function handleLogout(
  req: NextRequest,
  apiPath: "/auth/logout" | "/auth/logout-all",
) {
  const violation = csrfViolation(req);
  if (violation) return jsonError(403, violation);

  const session = await readSession(req);
  if (session) {
    try {
      await authedCall(session, apiPath, {
        method: "POST",
        clientIp: clientIpOf(req),
      });
    } catch {
      /* the cookie is cleared regardless */
    }
  }
  return applyCookieAction(
    new NextResponse(null, { status: 204, headers: noStore }),
    { kind: "clear" },
  );
}
