import { NextResponse, type NextRequest } from "next/server";
import { csrfViolation } from "@/lib/server/csrf";
import { authedCall, clientIpOf, readSession } from "@/lib/server/gateway";
import { forwardHeaders, jsonError } from "@/lib/server/http";
import { resolveTarget } from "@/lib/server/paths";
import { applyCookieAction } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // a 500-row bulk ingest fits comfortably
const MAX_QUERY_CHARS = 2048;

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const violation = csrfViolation(req);
  if (violation) return jsonError(403, violation);

  const { path } = await ctx.params;
  const target = resolveTarget(path);
  if (!target) return jsonError(404, "Not found");

  const search = req.nextUrl.search;
  if (search.length > MAX_QUERY_CHARS)
    return jsonError(414, "Request URL too long");

  const session = await readSession(req);
  if (!session) {
    return applyCookieAction(
      jsonError(401, "Not authenticated", { code: "unauthenticated" }),
      { kind: "clear" },
    );
  }

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
  const idem = req.headers.get("idempotency-key");
  if (idem && idem.length <= 200) headers.set("idempotency-key", idem);

  const result = await authedCall(session, `${target}${search}`, {
    method: req.method,
    headers,
    body: body && body.byteLength > 0 ? body : null,
    clientIp: clientIpOf(req),
  });

  if (result.kind === "unauthorized") {
    return applyCookieAction(
      jsonError(401, "Your session has expired.", { code: "session_expired" }),
      result.cookie,
    );
  }
  if (result.kind === "unavailable") {
    return applyCookieAction(
      jsonError(502, "Can't reach the server. Try again in a moment.", {
        code: "upstream_unavailable",
      }),
      result.cookie,
    );
  }

  const { res } = result;
  const out = new NextResponse(
    res.status === 204 || res.status === 304 ? null : await res.arrayBuffer(),
    {
      status: res.status,
      headers: forwardHeaders(res),
    },
  );
  return applyCookieAction(out, result.cookie);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
