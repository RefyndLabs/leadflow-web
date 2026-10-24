// The platform console's part of the mock API (/platform/*): its own accounts and tokens,
// a two-step sign-in where the code "123456" is always right, and the organization actions.
// Tenant tokens are never accepted here, and platform tokens never on tenant endpoints.
import { randomUUID } from "node:crypto";

export const PLATFORM_EMAIL = "ops@example.com";
export const PLATFORM_PASSWORD = "platform passphrase 1!";
export const PLATFORM_CODE = "123456";
const SECRET = "JBSWY3DPEHPK3PXP";

const uid = () => randomUUID();
const now = () => new Date().toISOString();

const me = {
  id: uid(),
  name: "Ops Person",
  email: PLATFORM_EMAIL,
  mfa_enabled: false,
  must_change_password: false,
  recovery_codes_left: 0,
};
const admins = [
  { ...me, is_active: true, last_login_at: null, created_at: now() },
];
const challenges = new Set();
const tokens = new Set();
const audit = [];

const org = (name, slug, extra = {}) => ({
  id: uid(),
  name,
  slug,
  is_active: true,
  integration_enabled: false,
  whatsapp_configured: false,
  whatsapp_phone_number_id: null,
  created_at: now(),
  users_total: 1,
  users_active: 1,
  leads_total: 0,
  last_login_at: null,
  error_alert_email: null,
  exhibition_reviewer_email: null,
  handoff_email: null,
  default_phone_region: "IN",
  website: null,
  ...extra,
});
const orgs = [
  org("Acme Exports", "acme-exports", {
    users_total: 4,
    users_active: 4,
    leads_total: 12,
    integration_enabled: true,
  }),
];
const users = new Map([
  [
    "acme-exports",
    [
      {
        id: uid(),
        name: "Ada Admin",
        email: "admin@example.com",
        role: "admin",
        is_active: true,
        locked: false,
        must_change_password: false,
        last_login_at: now(),
        created_at: now(),
      },
    ],
  ],
]);
const keys = [
  {
    id: uid(),
    name: "n8n",
    key_prefix: "lfi_O5FwTKWy",
    scopes: ["leads:ingest"],
    allowed_ips: null,
    created_at: now(),
    expires_at: null,
    last_used_at: now(),
    revoked_at: null,
  },
];

const temp = () => `Temp-${uid().slice(0, 12)}`;
const log = (action, target_org_slug = null, details = null) =>
  audit.unshift({
    id: uid(),
    occurred_at: now(),
    admin_email: PLATFORM_EMAIL,
    action,
    target_org_slug,
    target_type: null,
    target_id: null,
    details,
    ip_address: "127.0.0.1",
  });

const bearer = (req) =>
  (req.headers.authorization ?? "").replace(/^Bearer /, "");

/** Returns true when the request was a /platform/* one (answered here). */
export async function handlePlatform(
  req,
  res,
  path,
  method,
  url,
  { json, readBody },
) {
  if (!path.startsWith("/platform/")) return false;
  let m;

  if (path === "/platform/auth/login" && method === "POST") {
    const b = (await readBody(req)) ?? {};
    if (b.email !== PLATFORM_EMAIL || b.password !== PLATFORM_PASSWORD) {
      json(res, 401, { detail: "Invalid credentials" });
      return true;
    }
    const challenge_token = `plc_${uid()}`;
    challenges.add(challenge_token);
    const setup = !me.mfa_enabled;
    json(res, 200, {
      challenge_token,
      stage: setup ? "setup" : "verify",
      expires_in: 300,
      secret: setup ? SECRET : null,
      otpauth_uri: setup
        ? `otpauth://totp/Leadflow%20Platform:${encodeURIComponent(PLATFORM_EMAIL)}?secret=${SECRET}&issuer=Leadflow%20Platform`
        : null,
    });
    return true;
  }
  if (path === "/platform/auth/verify" && method === "POST") {
    const b = (await readBody(req)) ?? {};
    if (
      !challenges.has(b.challenge_token) ||
      (b.code ?? b.recovery_code) !== PLATFORM_CODE
    ) {
      json(res, 401, { detail: "Invalid or expired code" });
      return true;
    }
    challenges.delete(b.challenge_token);
    const firstTime = !me.mfa_enabled;
    me.mfa_enabled = true;
    const access_token = `plt_${uid()}`;
    tokens.add(access_token);
    log("platform.login");
    json(res, 200, {
      access_token,
      token_type: "bearer",
      expires_in: 43200,
      must_change_password: me.must_change_password,
      recovery_codes: firstTime
        ? Array.from(
            { length: 10 },
            (_, i) => `abcde-fgh${String(i).padStart(2, "0")}`,
          )
        : [],
    });
    return true;
  }

  if (!tokens.has(bearer(req))) {
    json(res, 401, { detail: "Invalid or expired credentials" });
    return true;
  }

  if (path === "/platform/auth/me") return (json(res, 200, me), true);
  if (path === "/platform/auth/logout") {
    tokens.delete(bearer(req));
    return (json(res, 204), true);
  }
  if (path === "/platform/auth/change-password") {
    me.must_change_password = false;
    return (json(res, 204), true);
  }
  if (path === "/platform/audit") {
    const slug = url.searchParams.get("org");
    return (
      json(
        res,
        200,
        slug ? audit.filter((a) => a.target_org_slug === slug) : audit,
      ),
      true
    );
  }

  if (path === "/platform/organizations" && method === "GET")
    return (json(res, 200, orgs), true);
  if (path === "/platform/organizations" && method === "POST") {
    const b = (await readBody(req)) ?? {};
    if (orgs.some((o) => o.slug === b.slug))
      return (
        json(res, 409, {
          detail: `An organization with the short name '${b.slug}' already exists`,
        }),
        true
      );
    const o = org(b.name, b.slug, {
      integration_enabled: false,
      leads_total: 0,
    });
    orgs.push(o);
    users.set(o.slug, [
      {
        id: uid(),
        name: b.admin_name,
        email: b.admin_email.toLowerCase(),
        role: "admin",
        is_active: true,
        locked: false,
        must_change_password: true,
        last_login_at: null,
        created_at: now(),
      },
    ]);
    log("platform.org_created", o.slug, { admin_email: b.admin_email });
    return (
      json(res, 201, {
        organization: o,
        admin_email: b.admin_email.toLowerCase(),
        temporary_password: temp(),
      }),
      true
    );
  }
  if (
    (m =
      /^\/platform\/organizations\/([a-z0-9-]+)(?:\/([a-z-]+))?(?:\/([^/]+)\/([a-z-]+))?$/.exec(
        path,
      ))
  ) {
    const o = orgs.find((x) => x.slug === m[1]);
    if (!o) return (json(res, 404, { detail: "Organization not found" }), true);
    const action = m[2];
    if (!action && method === "GET") return (json(res, 200, o), true);
    if (action === "suspend") {
      const b = (await readBody(req)) ?? {};
      if (b.confirm_slug !== o.slug)
        return (
          json(res, 422, {
            detail: "Type the organization's short name to confirm",
          }),
          true
        );
      o.is_active = false;
      log("platform.org_suspended", o.slug);
      return (json(res, 200, o), true);
    }
    if (action === "activate") {
      o.is_active = true;
      log("platform.org_activated", o.slug);
      return (json(res, 200, o), true);
    }
    if (action === "integration") {
      const b = (await readBody(req)) ?? {};
      o.integration_enabled = Boolean(b.enabled);
      log(
        b.enabled
          ? "platform.org_integration_enabled"
          : "platform.org_integration_disabled",
        o.slug,
      );
      return (json(res, 200, o), true);
    }
    if (action === "notifications") {
      Object.assign(o, (await readBody(req)) ?? {});
      log("platform.org_notifications_updated", o.slug);
      return (json(res, 200, o), true);
    }
    if (action === "whatsapp" && method === "PUT") {
      const b = (await readBody(req)) ?? {};
      Object.assign(o, {
        whatsapp_configured: true,
        whatsapp_phone_number_id: b.phone_number_id,
      });
      log("platform.org_whatsapp_set", o.slug, {
        phone_number_id: b.phone_number_id,
      });
      return (json(res, 200, o), true);
    }
    if (action === "whatsapp" && method === "DELETE") {
      Object.assign(o, {
        whatsapp_configured: false,
        whatsapp_phone_number_id: null,
      });
      log("platform.org_whatsapp_cleared", o.slug);
      return (json(res, 200, o), true);
    }
    if (action === "users" && !m[3])
      return (json(res, 200, users.get(o.slug) ?? []), true);
    if (action === "users" && m[3]) {
      const u = (users.get(o.slug) ?? []).find((x) => x.id === m[3]);
      if (!u) return (json(res, 404, { detail: "User not found" }), true);
      if (m[4] === "unlock") {
        u.locked = false;
        return (json(res, 204), true);
      }
      if (m[4] === "reset-password") {
        u.must_change_password = true;
        log("platform.user_password_reset", o.slug, { email: u.email });
        return (
          json(res, 200, { email: u.email, temporary_password: temp() }),
          true
        );
      }
    }
    return (json(res, 405, { detail: "Method not allowed" }), true);
  }

  if (path === "/platform/integration-keys")
    return (json(res, 200, keys), true);
  if ((m = /^\/platform\/integration-keys\/([^/]+)\/revoke$/.exec(path))) {
    const k = keys.find((x) => x.id === m[1]);
    if (!k) return (json(res, 404, { detail: "Key not found" }), true);
    if (k.revoked_at)
      return (json(res, 409, { detail: "That key is already revoked" }), true);
    k.revoked_at = now();
    log("platform.integration_key_revoked", null, { prefix: k.key_prefix });
    return (json(res, 204), true);
  }

  if (path === "/platform/admins" && method === "GET")
    return (json(res, 200, admins), true);
  if (path === "/platform/admins" && method === "POST") {
    const b = (await readBody(req)) ?? {};
    const a = {
      id: uid(),
      name: b.name,
      email: b.email.toLowerCase(),
      is_active: true,
      mfa_enabled: false,
      must_change_password: true,
      last_login_at: null,
      created_at: now(),
    };
    admins.push(a);
    log("platform.admin_created", null, { email: a.email });
    return (json(res, 201, { admin: a, temporary_password: temp() }), true);
  }
  if ((m = /^\/platform\/admins\/([^/]+)\/([a-z-]+)$/.exec(path))) {
    const a = admins.find((x) => x.id === m[1]);
    if (!a)
      return (json(res, 404, { detail: "Platform admin not found" }), true);
    if (a.id === me.id)
      return (
        json(res, 400, { detail: "You can't do this to your own account" }),
        true
      );
    if (m[2] === "reset-password")
      return (
        json(res, 200, { email: a.email, temporary_password: temp() }),
        true
      );
    if (m[2] === "reset-mfa") a.mfa_enabled = false;
    if (m[2] === "deactivate") a.is_active = false;
    if (m[2] === "activate") a.is_active = true;
    return (json(res, 200, a), true);
  }

  json(res, 404, { detail: "Not Found" });
  return true;
}
