import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page render:
 *  - sends signed-out visitors to /login (the API and the cookie are re-checked on every data call)
 *  - attaches a per-request nonce CSP
 * API routes are excluded (they answer JSON and enforce auth themselves).
 */
const SESSION_COOKIES = ["__Host-lf_session", "lf_session"];
const PUBLIC_PATHS = new Set(["/login"]);
const PLATFORM_COOKIES = ["__Host-lf_platform", "lf_platform"];

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  const sentry = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const connect = ["'self'", sentry].filter(Boolean).join(" ");
  // Photos and recordings are served by our own /api/attachments route; previews of fresh captures are blob: URLs.
  const media = "'self' blob:";
  const img = "'self' data: blob:";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Radix / Sonner position elements with inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img}`,
    `media-src ${media}`,
    "font-src 'self' data:",
    `connect-src ${connect}${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The platform console has its own cookie and sign-in page; a customer session never opens it.
  const isPlatform =
    pathname === "/platform" || pathname.startsWith("/platform/");
  if (isPlatform) {
    const hasPlatform = PLATFORM_COOKIES.some((n) => request.cookies.has(n));
    if (!hasPlatform && pathname !== "/platform/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/platform/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!isPlatform && !hasSession && !PUBLIC_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/")
      url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  response.headers.set("cache-control", "no-store");
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|ico|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
