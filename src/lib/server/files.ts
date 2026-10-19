import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { csrfViolation } from "./csrf";
import {
  authedCall,
  authedStreamCall,
  clientIpOf,
  readSession,
} from "./gateway";
import { forwardHeaders, jsonError } from "./http";
import { applyCookieAction } from "./session";

/** The API accepts up to 16 MB per file; leave room for multipart framing. */
export const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;

const uuid = z.uuid();

/** Counts bytes as they stream through and errors out past the limit (covers requests with no Content-Length). */
function limitStream(max: number) {
  let seen = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > max) controller.error(new Error("too_large"));
      else controller.enqueue(chunk);
    },
  });
}

/**
 * Streams a multipart photo / voice upload to the API without buffering or re-encoding it.
 * The browser never sees the API address or a token; the API's status and message come back unchanged.
 */
export async function proxyUpload(
  req: NextRequest,
  captureId: string,
  kind: "card" | "card-back" | "voice",
) {
  const violation = csrfViolation(req);
  if (violation) return jsonError(403, violation);
  if (!uuid.safeParse(captureId).success) return jsonError(404, "Not found");

  const type = req.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;\s*boundary=/i.test(type))
    return jsonError(415, "Send the file as a form upload.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES)
    return jsonError(413, "That file is too big. Files can be up to 16 MB.");
  if (!req.body) return jsonError(422, "No file was sent.");

  const session = await readSession(req);
  if (!session)
    return applyCookieAction(
      jsonError(401, "Not authenticated", { code: "unauthenticated" }),
      { kind: "clear" },
    );

  const result = await authedStreamCall(
    session,
    `/captures/${captureId}/${kind}`,
    {
      method: "POST",
      headers: { "content-type": type },
      body: req.body.pipeThrough(limitStream(MAX_UPLOAD_BYTES)),
      clientIp: clientIpOf(req),
    },
  );

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
  const body = await result.res.arrayBuffer(); // small JSON (the Capture); files only ever stream *to* the API
  return applyCookieAction(
    new NextResponse(body, {
      status: result.res.status,
      headers: forwardHeaders(result.res),
    }),
    result.cookie,
  );
}

const PASS = ["content-length", "content-range", "accept-ranges"];

/**
 * Streams a stored photo / recording to the browser, honouring `Range` (Safari only plays audio when
 * seeking works). Only image and audio are ever shown inline; anything else is forced to download.
 */
export async function proxyDownload(req: NextRequest, attachmentId: string) {
  if (!uuid.safeParse(attachmentId).success) return jsonError(404, "Not found");
  const session = await readSession(req);
  if (!session)
    return applyCookieAction(
      jsonError(401, "Not authenticated", { code: "unauthenticated" }),
      { kind: "clear" },
    );

  const headers = new Headers();
  const range = req.headers.get("range");
  if (range && /^bytes=\d*-\d*(,\s*\d*-\d*)*$/.test(range))
    headers.set("range", range);

  const result = await authedCall(
    session,
    `/attachments/${attachmentId}/content`,
    { method: "GET", headers, clientIp: clientIpOf(req) },
  );
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
  if (!res.ok && res.status !== 206) {
    const text = await res.text();
    return applyCookieAction(
      new NextResponse(text, {
        status: res.status,
        headers: forwardHeaders(res),
      }),
      result.cookie,
    );
  }

  const type = res.headers.get("content-type") ?? "application/octet-stream";
  const inline = /^(image|audio)\//i.test(type);
  const out = new Headers({
    "content-type": inline ? type : "application/octet-stream",
    "content-disposition": inline ? "inline" : "attachment",
    // Private (cookie-authenticated) but safe to reuse briefly, so thumbnails don't refetch on every render.
    "cache-control": "private, max-age=300",
    vary: "Cookie, Range",
  });
  for (const name of PASS) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  if (!out.has("accept-ranges")) out.set("accept-ranges", "bytes");
  return applyCookieAction(
    new NextResponse(res.status === 204 ? null : res.body, {
      status: res.status,
      headers: out,
    }),
    result.cookie,
  );
}
