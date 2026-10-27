/** Allow-list for what the browser may reach through the /api/lf gateway. Pure, so it is unit-testable. */
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/** Top-level API resources the browser may reach through the gateway. */
const RESOURCES = new Set([
  "users",
  "service-api-keys",
  "organization",
  "audit-logs",
  "accounts",
  "contacts",
  "leads",
  "products",
  "cadences",
  "message-templates",
  "ignored-senders",
  "collaterals",
  "catalogue",
  "faqs",
  "events",
  "captures",
  "attachments",
]);

/**
 * n8n-only verbs (captures:process / research:process). The UI never calls them, so the gateway refuses
 * them outright. `/research/*` itself is not a browser resource either; people use `/leads/{id}/research`.
 */
const PROCESS_ONLY = new Set([
  "claim",
  "extraction",
  "extraction-context",
  "fail",
]);

/**
 * The first-message actions a person takes on `/outreach/{id}`. The queue itself and claim, context,
 * draft, sent and fail are n8n's (outreach:process), so the gateway refuses them.
 */
const OUTREACH_ACTIONS = new Set([
  "approve",
  "mark-sent",
  "redraft",
  "retry",
  "cancel",
]);

/** /auth/* endpoints the browser may call there (login/refresh/logout have dedicated routes). */
const AUTH_ALLOWED = new Set(["me", "change-password"]);

export function resolveTarget(segments: string[]): string | null {
  if (segments.length === 0 || segments.length > 6) return null;
  if (!segments.every((s) => SEGMENT.test(s))) return null; // blocks "..", encoded slashes, etc.
  const [head, second] = segments;
  if (head === "auth")
    return segments.length === 2 && AUTH_ALLOWED.has(second!)
      ? `/${segments.join("/")}`
      : null;
  if (head === "outreach")
    return segments.length === 2 ||
      (segments.length === 3 && OUTREACH_ACTIONS.has(segments[2]!))
      ? `/${segments.join("/")}`
      : null;
  if (segments.some((s) => PROCESS_ONLY.has(s))) return null;
  return RESOURCES.has(head!) ? `/${segments.join("/")}` : null;
}

/* ── Platform console (/api/platform/lf/*) ───────────────────────────────── */

const UUID = /^[0-9a-fA-F-]{36}$/;
const ORG_ACTIONS = new Set([
  "suspend",
  "activate",
  "integration",
  "notifications",
  "whatsapp",
  "users",
  "deletion",
  "delete",
]);
const ORG_USER_ACTIONS = new Set(["unlock", "reset-password"]);
const ADMIN_ACTIONS = new Set([
  "deactivate",
  "activate",
  "reset-password",
  "reset-mfa",
  "role",
]);
const AUTH_PATHS = new Set([
  "me",
  "change-password",
  "recovery-codes",
  "sessions",
  "sessions/end-others",
]);

/**
 * What the console's browser code may reach, mapped to the API's /platform/* paths. Sign-in and
 * sign-out have dedicated routes (the challenge and session cookies never pass through here).
 */
export function resolvePlatformTarget(segments: string[]): string | null {
  if (segments.length === 0 || segments.length > 5) return null;
  if (!segments.every((s) => SEGMENT.test(s))) return null;
  const [head, a, b, c, d] = segments;
  const path = `/platform/${segments.join("/")}`;
  const n = segments.length;
  switch (head) {
    case "auth":
      return n <= 3 && AUTH_PATHS.has(segments.slice(1).join("/"))
        ? path
        : null;
    case "audit":
      return n === 1 ? path : null;
    case "organizations":
      if (n <= 2) return path;
      if (n === 3) return ORG_ACTIONS.has(b!) ? path : null;
      return n === 5 &&
        b === "users" &&
        UUID.test(c!) &&
        ORG_USER_ACTIONS.has(d!)
        ? path
        : null;
    case "integration-keys":
      if (n === 1) return path;
      return n === 3 && UUID.test(a!) && b === "revoke" ? path : null;
    case "admins":
      if (n === 1) return path;
      return n === 3 && UUID.test(a!) && ADMIN_ACTIONS.has(b!) ? path : null;
    default:
      return null;
  }
}
