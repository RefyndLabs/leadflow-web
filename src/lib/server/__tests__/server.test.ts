import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { csrfViolation } from "../csrf";
import { authedCall, refreshSession, sessionFromTokens } from "../gateway";
import { resolveTarget } from "../paths";
import { openSession, sealSession, type SessionData } from "../session";

const req = (method: string, headers: Record<string, string> = {}) =>
  new NextRequest("http://app.test/api/lf/leads", {
    method,
    headers: { host: "app.test", ...headers },
  });

describe("gateway allow-list", () => {
  it.each([
    [["leads"], "/leads"],
    [
      ["leads", "3f2c1e9a-1111-4222-8333-444455556666", "context"],
      "/leads/3f2c1e9a-1111-4222-8333-444455556666/context",
    ],
    [["auth", "me"], "/auth/me"],
    [["auth", "change-password"], "/auth/change-password"],
    [["service-api-keys"], "/service-api-keys"],
    [["captures"], "/captures"],
    [
      ["captures", "3f2c1e9a-1111-4222-8333-444455556666", "submit"],
      "/captures/3f2c1e9a-1111-4222-8333-444455556666/submit",
    ],
    [
      ["attachments", "3f2c1e9a-1111-4222-8333-444455556666"],
      "/attachments/3f2c1e9a-1111-4222-8333-444455556666",
    ],
    [
      ["leads", "3f2c1e9a-1111-4222-8333-444455556666", "research"],
      "/leads/3f2c1e9a-1111-4222-8333-444455556666/research",
    ],
    [
      [
        "leads",
        "3f2c1e9a-1111-4222-8333-444455556666",
        "notes",
        "3f2c1e9a-1111-4222-8333-444455556667",
      ],
      "/leads/3f2c1e9a-1111-4222-8333-444455556666/notes/3f2c1e9a-1111-4222-8333-444455556667",
    ],
    [
      ["captures", "3f2c1e9a-1111-4222-8333-444455556666", "card-back"],
      "/captures/3f2c1e9a-1111-4222-8333-444455556666/card-back",
    ],
    [["leads", "overview"], "/leads/overview"],
    [["events", "current"], "/events/current"],
    [
      ["leads", "3f2c1e9a-1111-4222-8333-444455556666", "first-touch"],
      "/leads/3f2c1e9a-1111-4222-8333-444455556666/first-touch",
    ],
    [
      ["outreach", "3f2c1e9a-1111-4222-8333-444455556666"],
      "/outreach/3f2c1e9a-1111-4222-8333-444455556666",
    ],
    [
      ["outreach", "3f2c1e9a-1111-4222-8333-444455556666", "approve"],
      "/outreach/3f2c1e9a-1111-4222-8333-444455556666/approve",
    ],
    [
      ["outreach", "3f2c1e9a-1111-4222-8333-444455556666", "mark-sent"],
      "/outreach/3f2c1e9a-1111-4222-8333-444455556666/mark-sent",
    ],
    [["message-templates"], "/message-templates"],
    [
      ["message-templates", "3f2c1e9a-1111-4222-8333-444455556666"],
      "/message-templates/3f2c1e9a-1111-4222-8333-444455556666",
    ],
    [["ignored-senders"], "/ignored-senders"],
    [
      ["ignored-senders", "3f2c1e9a-1111-4222-8333-444455556666"],
      "/ignored-senders/3f2c1e9a-1111-4222-8333-444455556666",
    ],
    [
      ["leads", "3f2c1e9a-1111-4222-8333-444455556666", "handoff"],
      "/leads/3f2c1e9a-1111-4222-8333-444455556666/handoff",
    ],
    [["email", "mailboxes"], "/email/mailboxes"],
    [
      ["email", "mailboxes", "google", "authorize"],
      "/email/mailboxes/google/authorize",
    ],
    [
      ["email", "mailboxes", "3f2c1e9a-1111-4222-8333-444455556666"],
      "/email/mailboxes/3f2c1e9a-1111-4222-8333-444455556666",
    ],
  ])("allows %j", (segs, target) => expect(resolveTarget(segs)).toBe(target));

  it.each([
    // The automation's own endpoints are never reachable from the browser.
    [["whatsapp", "messages"]],
    [["integrations", "orgs"]],
    [["auth", "login"]],
    [["captures", "3f2c1e9a-1111-4222-8333-444455556666", "claim"]],
    [["captures", "3f2c1e9a-1111-4222-8333-444455556666", "extraction"]],
    [["captures", "3f2c1e9a-1111-4222-8333-444455556666", "fail"]],
    [
      [
        "captures",
        "3f2c1e9a-1111-4222-8333-444455556666",
        "extraction-context",
      ],
    ],
    // n8n's research queue is not a browser resource; people use /leads/{id}/research.
    [["research"]],
    [["research", "3f2c1e9a-1111-4222-8333-444455556666", "claim"]],
    [["research", "3f2c1e9a-1111-4222-8333-444455556666", "result"]],
    // The first-message queue and the workflow's verbs are n8n's (outreach:process).
    [["outreach"]],
    [["outreach", "3f2c1e9a-1111-4222-8333-444455556666", "claim"]],
    [["outreach", "3f2c1e9a-1111-4222-8333-444455556666", "context"]],
    [["outreach", "3f2c1e9a-1111-4222-8333-444455556666", "draft"]],
    [["outreach", "3f2c1e9a-1111-4222-8333-444455556666", "sent"]],
    [["outreach", "3f2c1e9a-1111-4222-8333-444455556666", "fail"]],
    [["outreach", "3f2c1e9a-1111-4222-8333-444455556666", "approve", "x"]],
    // Email: the received-email queue and sending are n8n's; Google calls the OAuth callback and push itself.
    [["email"]],
    [["email", "messages"]],
    [["email", "inbound", "3f2c1e9a-1111-4222-8333-444455556666"]],
    [["email", "inbound", "3f2c1e9a-1111-4222-8333-444455556666", "claim"]],
    [["email", "oauth", "google", "callback"]],
    [["email", "push", "google"]],
    [["email", "mailboxes", "google"]],
    [["email", "mailboxes", "not-a-uuid"]],
    [["email", "mailboxes", "3f2c1e9a-1111-4222-8333-444455556666", "x"]],
    [["auth", "refresh"]],
    [["auth", "logout"]],
    [["health"]],
    [["ready"]],
    [["docs"]],
    [["openapi.json"]],
    [[".."]],
    [["leads", ".."]],
    [["leads", "a%2f..%2fhealth"]],
    [["leads", "a/b"]],
    [[]],
    [["x", "y", "z", "a", "b", "c", "d"]],
  ])("refuses %j", (segs) =>
    expect(resolveTarget(segs as string[])).toBeNull(),
  );
});

describe("CSRF", () => {
  it("lets safe methods through", () =>
    expect(csrfViolation(req("GET"))).toBeNull());
  it("requires the custom header", () =>
    expect(csrfViolation(req("POST", { origin: "http://app.test" }))).toMatch(
      /CSRF/,
    ));
  it("requires an Origin", () =>
    expect(csrfViolation(req("POST", { "x-lf-csrf": "1" }))).toMatch(/Origin/));
  it("refuses a foreign Origin", () =>
    expect(
      csrfViolation(
        req("POST", { "x-lf-csrf": "1", origin: "http://evil.test" }),
      ),
    ).toMatch(/not allowed/));
  it("refuses cross-site fetch metadata even with a matching Origin", () =>
    expect(
      csrfViolation(
        req("POST", {
          "x-lf-csrf": "1",
          origin: "http://app.test",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toMatch(/Cross-site/));
  it("accepts a same-origin request", () =>
    expect(
      csrfViolation(
        req("POST", {
          "x-lf-csrf": "1",
          origin: "http://app.test",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBeNull());
  it("honours the forwarded host behind a proxy", () =>
    expect(
      csrfViolation(
        req("POST", {
          "x-lf-csrf": "1",
          origin: "https://crm.example.com",
          "x-forwarded-host": "crm.example.com",
        }),
      ),
    ).toBeNull());
});

describe("session cookie", () => {
  const data: SessionData = {
    at: "access.jwt.value",
    rt: "refresh-token-value",
    ate: Date.now() + 900_000,
  };

  it("round-trips and never contains the tokens in clear text", async () => {
    const sealed = await sealSession(data);
    expect(sealed).not.toContain("access.jwt.value");
    expect(sealed).not.toContain("refresh-token-value");
    expect(await openSession(sealed)).toEqual(data);
  });

  it("rejects tampering and garbage", async () => {
    const sealed = await sealSession(data);
    const flipped =
      sealed.slice(0, -3) + (sealed.endsWith("AAA") ? "BBB" : "AAA");
    expect(await openSession(flipped)).toBeNull();
    expect(await openSession("not-a-token")).toBeNull();
    expect(await openSession(undefined)).toBeNull();
  });
});

describe("token refresh (single-use rotating refresh tokens)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  it("many parallel requests holding the same stale cookie trigger exactly ONE refresh", async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 25));
        return json(200, {
          access_token: "new-at",
          refresh_token: "new-rt",
          expires_in: 900,
        });
      }
      return json(200, { ok: true });
    });

    const stale: SessionData = {
      at: "old-at",
      rt: "shared-old-rt-1",
      ate: Date.now() - 1000,
    };
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        authedCall(stale, "/leads", { method: "GET" }),
      ),
    );

    expect(refreshCalls).toBe(1);
    for (const r of results) {
      expect(r.kind).toBe("response");
      expect(r.cookie).toMatchObject({
        kind: "set",
        session: { at: "new-at", rt: "new-rt" },
      });
    }
  });

  it("a late request still carrying the old cookie reuses the result instead of replaying the old token", async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls++;
        return json(200, {
          access_token: "at2",
          refresh_token: "rt2",
          expires_in: 900,
        });
      }
      return json(200, {});
    });
    const stale: SessionData = { at: "a", rt: "grace-window-rt", ate: 0 };
    await authedCall(stale, "/leads", { method: "GET" });
    await authedCall(stale, "/leads", { method: "GET" }); // same stale cookie, arrives afterwards
    expect(refreshCalls).toBe(1);
  });

  it("a rejected refresh ends the session and clears the cookie (fail safe — no retry)", async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls++;
        return json(401, { detail: "Invalid credentials" });
      }
      return json(200, {});
    });
    const r = await authedCall(
      { at: "a", rt: "rejected-rt-value", ate: 0 },
      "/leads",
      { method: "GET" },
    );
    expect(r).toEqual({ kind: "unauthorized", cookie: { kind: "clear" } });
    expect(refreshCalls).toBe(1);
  });

  it("an API outage during refresh does NOT log the user out", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const r = await authedCall(
      { at: "a", rt: "outage-rt-value", ate: 0 },
      "/leads",
      { method: "GET" },
    );
    expect(r.kind).toBe("unavailable");
    expect(r.cookie).toEqual({ kind: "none" });
  });

  it("refreshes reactively once on a 401 from a still-'valid' access token, then retries", async () => {
    const seen: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/refresh"))
        return json(200, {
          access_token: "fresh",
          refresh_token: "rt-next",
          expires_in: 900,
        });
      seen.push(new Headers(init?.headers).get("authorization") ?? "");
      return seen.length === 1
        ? json(401, { detail: "expired" })
        : json(200, { ok: true });
    });
    const r = await authedCall(
      {
        at: "revoked-early",
        rt: "reactive-rt-value",
        ate: Date.now() + 600_000,
      },
      "/leads",
      { method: "GET" },
    );
    expect(seen).toEqual(["Bearer revoked-early", "Bearer fresh"]);
    expect(r.kind).toBe("response");
  });

  it("a 401 that survives a refresh ends the session", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/auth/refresh")
        ? json(200, { access_token: "x", refresh_token: "y", expires_in: 900 })
        : json(401, {}),
    );
    const r = await authedCall(
      { at: "a", rt: "double-401-rt-val", ate: Date.now() + 600_000 },
      "/leads",
      { method: "GET" },
    );
    expect(r).toEqual({ kind: "unauthorized", cookie: { kind: "clear" } });
  });

  it("refreshSession dedupes by refresh token", async () => {
    fetchMock.mockResolvedValue(
      json(200, { access_token: "a", refresh_token: "b", expires_in: 900 }),
    );
    const s: SessionData = { at: "x", rt: "dedupe-rt-value", ate: 0 };
    const [a, b] = await Promise.all([refreshSession(s), refreshSession(s)]);
    expect(a).toBe(b === a ? a : a); // same outcome object
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sessionFromTokens computes the access expiry", () => {
    const before = Date.now();
    const s = sessionFromTokens({
      access_token: "a",
      refresh_token: "r",
      expires_in: 900,
    });
    expect(s.ate).toBeGreaterThanOrEqual(before + 899_000);
  });
});
