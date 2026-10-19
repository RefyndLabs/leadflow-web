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
  if (segments.some((s) => PROCESS_ONLY.has(s))) return null;
  return RESOURCES.has(head!) ? `/${segments.join("/")}` : null;
}
