import { NextResponse, type NextRequest } from "next/server";
import { csrfViolation } from "@/lib/server/csrf";
import { clientIpOf } from "@/lib/server/gateway";
import { forwardHeaders, jsonError } from "@/lib/server/http";
import { resolvePlatformTarget } from "@/lib/server/paths";
import {
  clearPlatformSession,
  platformCall,
  readPlatformSession,
} from "@/lib/server/platform";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_QUERY_CHARS = 1024;

/** The console's gateway: only /platform/* paths on the allow-list, only with the platform cookie. */
async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const violation = csrfViolation(req);
  if (violation) return jsonError(403, violation);

  const { path } = await ctx.params;
  const target = resolvePlatformTarget(path);
  if (!target) return jsonError(404, "Not found");

  const search = req.nextUrl.search;
  if (search.length > MAX_QUERY_CHARS)
    return jsonError(414, "Request URL too long");

  const session = await readPlatformSession(req);
  if (!session)
    return clearPlatformSession(
      jsonError(401, "Not signed in", { code: "unauthenticated" }),
    );

  let body: ArrayBuffer | null = null;
  if (req.method !== "GET" && req.method !== "DELETE") {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES)
      return jsonError(413, "Request body too large");
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES)
      return jsonError(413, "Request body too large");
  }
  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct && body && body.byteLength > 0) headers.set("content-type", ct);

  let res: Response;
  try {
    res = await platformCall(session, `${target}${search}`, {
      method: req.method,
      headers,
      body: body && body.byteLength > 0 ? body : null,
      clientIp: clientIpOf(req),
    });
  } catch {
    return jsonError(502, "Can't reach the server. Try again in a moment.", {
      code: "upstream_unavailable",
    });
  }
  if (res.status === 401)
    return clearPlatformSession(
      jsonError(401, "Your session has ended.", { code: "session_expired" }),
    );

  return new NextResponse(
    res.status === 204 || res.status === 304 ? null : await res.arrayBuffer(),
    { status: res.status, headers: forwardHeaders(res) },
  );
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
