// The platform console's part of the mock API (/platform/*): its own accounts and tokens,
// a two-step sign-in where the code "123456" is always right (also as the fresh code that
// changing a password, deleting an organization or making an owner needs), and the
// organization actions. Tenant tokens are never accepted here, and platform tokens never
// on tenant endpoints. The signed-in admin is an owner.
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
  role: "owner",
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
  deletion_due_at: null,
  deletion_scheduled_at: null,
  deletion_scheduled_by: null,
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

/** The fresh authenticator code: null when right, else the API's answer. */
const freshCode = (b) =>
  !(b.code ?? b.recovery_code)
    ? [422, { detail: "Enter the code from your authenticator app" }]
    : (b.code ?? b.recovery_code) !== PLATFORM_CODE
      ? [
          403,
          {
            detail:
              "That code is wrong or was already used. Wait for the next one and try again",
          },
        ]
      : null;
const DAY = 24 * 60 * 60 * 1000;
const clearDeletion = (o) =>
  Object.assign(o, {
    deletion_due_at: null,
    deletion_scheduled_at: null,
    deletion_scheduled_by: null,
  });

/** Returns true when the request was a /platform/* one (answered here). */
export async function handlePlatform(
  req,
  res,
  path,
  method,
  url,
  { json, readBody },
) {
  let m;
  // Test hook (mock only): a scheduled deletion's 7 days are over.
  if (
    (m = /^\/__platform\/due\/([a-z0-9-]+)$/.exec(path)) &&
    method === "POST"
  ) {
    const o = orgs.find((x) => x.slug === m[1]);
    if (!o?.deletion_due_at)
      return (json(res, 404, { detail: "Nothing scheduled" }), true);
    o.deletion_due_at = new Date(Date.now() - 60_000).toISOString();
    return (json(res, 200, o), true);
  }
  if (!path.startsWith("/platform/")) return false;

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
    const b = (await readBody(req)) ?? {};
    if (b.current_password !== PLATFORM_PASSWORD)
      return (json(res, 403, { detail: "Current password is wrong" }), true);
    const bad = freshCode(b);
    if (bad) return (json(res, ...bad), true);
    me.must_change_password = false;
    log("platform.password_changed");
    return (json(res, 204), true);
  }
  if (path === "/platform/auth/recovery-codes" && method === "POST") {
    const bad = freshCode((await readBody(req)) ?? {});
    if (bad) return (json(res, ...bad), true);
    me.recovery_codes_left = 10;
    log("platform.recovery_codes_replaced");
    return (
      json(res, 200, {
        recovery_codes: Array.from(
          { length: 10 },
          (_, i) => `newer-code${String(i).padStart(2, "0")}`,
        ),
      }),
      true
    );
  }
  if (path === "/platform/auth/sessions" && method === "GET") {
    const current = bearer(req);
    return (
      json(
        res,
        200,
        [...tokens].map((t) => ({
          id: t.slice(4),
          created_at: now(),
          last_used_at: now(),
          expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
          ip_address: "127.0.0.1",
          user_agent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36",
          current: t === current,
        })),
      ),
      true
    );
  }
  if (path === "/platform/auth/sessions/end-others" && method === "POST") {
    for (const t of [...tokens]) if (t !== bearer(req)) tokens.delete(t);
    log("platform.other_sessions_ended");
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
      clearDeletion(o);
      log("platform.org_activated", o.slug);
      return (json(res, 200, o), true);
    }
    if (action === "deletion" && method === "POST") {
      const b = (await readBody(req)) ?? {};
      if (b.confirm_slug !== o.slug)
        return (
          json(res, 422, {
            detail: "Type the organization's short name to confirm",
          }),
          true
        );
      if (o.is_active)
        return (
          json(res, 409, { detail: "Suspend the organization first" }),
          true
        );
      const bad = freshCode(b);
      if (bad) return (json(res, ...bad), true);
      Object.assign(o, {
        deletion_scheduled_at: now(),
        deletion_due_at: new Date(Date.now() + 7 * DAY).toISOString(),
        deletion_scheduled_by: PLATFORM_EMAIL,
      });
      log("platform.org_deletion_scheduled", o.slug);
      return (json(res, 200, o), true);
    }
    if (action === "deletion" && method === "DELETE") {
      if (!o.deletion_due_at)
        return (json(res, 409, { detail: "No deletion is scheduled" }), true);
      clearDeletion(o);
      log("platform.org_deletion_cancelled", o.slug);
      return (json(res, 200, o), true);
    }
    if (action === "delete" && method === "POST") {
      const b = (await readBody(req)) ?? {};
      if (b.confirm_slug !== o.slug)
        return (
          json(res, 422, {
            detail: "Type the organization's short name to confirm",
          }),
          true
        );
      if (!o.deletion_due_at || new Date(o.deletion_due_at) > new Date())
        return (
          json(res, 409, {
            detail: "Suspend the organization and schedule its deletion first",
          }),
          true
        );
      const bad = freshCode(b);
      if (bad) return (json(res, ...bad), true);
      orgs.splice(orgs.indexOf(o), 1);
      users.delete(o.slug);
      log("platform.org_deleted", o.slug, { name: o.name });
      return (
        json(res, 200, { slug: o.slug, rows_deleted: { users: 1 } }),
        true
      );
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
    if (!b.email.toLowerCase().endsWith("@example.com"))
      return (
        json(res, 422, {
          detail:
            "Platform admins must use an email address ending in @example.com",
        }),
        true
      );
    if (b.role === "owner") {
      const bad = freshCode(b);
      if (bad) return (json(res, ...bad), true);
    }
    const a = {
      id: uid(),
      name: b.name,
      email: b.email.toLowerCase(),
      role: b.role ?? "staff",
      is_active: true,
      mfa_enabled: false,
      must_change_password: true,
      last_login_at: null,
      created_at: now(),
    };
    admins.push(a);
    log("platform.admin_created", null, { email: a.email, role: a.role });
    return (json(res, 201, { admin: a, temporary_password: temp() }), true);
  }
  if (
    (m = /^\/platform\/admins\/([^/]+)\/role$/.exec(path)) &&
    method === "PUT"
  ) {
    const a = admins.find((x) => x.id === m[1]);
    if (!a)
      return (json(res, 404, { detail: "Platform admin not found" }), true);
    const b = (await readBody(req)) ?? {};
    if (b.role === "owner" && a.role !== "owner") {
      const bad = freshCode(b);
      if (bad) return (json(res, ...bad), true);
    }
    log("platform.admin_role_changed", null, {
      email: a.email,
      from: a.role,
      to: b.role,
    });
    a.role = b.role;
    return (json(res, 200, a), true);
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
    if (m[2] === "reset-password" || m[2] === "reset-mfa") {
      const bad = freshCode((await readBody(req)) ?? {});
      if (bad) return (json(res, ...bad), true);
    }
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
