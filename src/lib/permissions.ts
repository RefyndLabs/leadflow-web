import type { Me, Permission } from "./api/types";

/** Permissions an API key may hold (build guide §8.12). Anything else is human-only. */
export const GRANTABLE_KEY_SCOPES = [
  "leads:read",
  "leads:write",
  "leads:ingest",
  "leads:sweep",
  "stats:read",
  "touchpoints:write",
  "quotations:read",
  "quotations:write",
  "samples:read",
  "samples:write",
  "accounts:read",
  "accounts:write",
  "contacts:read",
  "contacts:write",
  "catalog:read",
  "events:read",
  "cadences:read",
] as const satisfies readonly Permission[];

/** Plain-language description of each grantable scope, for the key picker. */
export const SCOPE_HELP: Record<(typeof GRANTABLE_KEY_SCOPES)[number], string> =
  {
    "leads:read": "Read leads and their conversations",
    "leads:write": "Edit leads, status, score and owner",
    "leads:ingest": "Create leads from inbound enquiries",
    "leads:sweep": "Run the stale-lead sweep",
    "stats:read": "Read dashboard statistics",
    "touchpoints:write": "Log messages and calls on a lead",
    "quotations:read": "Read quotations",
    "quotations:write": "Create and edit quotations",
    "samples:read": "Read sample requests",
    "samples:write": "Create and edit sample requests",
    "accounts:read": "Read companies",
    "accounts:write": "Create and edit companies",
    "contacts:read": "Read contacts",
    "contacts:write": "Create and edit contacts",
    "catalog:read": "Read products, catalogue, FAQs and collateral",
    "events:read": "Read exhibitions",
    "cadences:read": "Read follow-up rules and what's due",
  };

/** Permission checks always go through the live `permissions` array, never the role string. */
export function can(
  me: Pick<Me, "permissions"> | null | undefined,
  permission: Permission | string,
): boolean {
  return Boolean(me?.permissions.includes(permission));
}

export function canAny(
  me: Pick<Me, "permissions"> | null | undefined,
  permissions: readonly string[],
): boolean {
  return permissions.some((p) => can(me, p));
}
