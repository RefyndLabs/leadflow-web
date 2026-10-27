import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { resolvePlatformTarget, resolveTarget } from "../paths";
import {
  platformCookieName,
  readPlatformSession,
  setPlatformSession,
} from "../platform";
import { openSession, sealSession } from "../session";

const ID = "3f2c1e9a-1111-4222-8333-444455556666";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "unit-test-secret-unit-test-secret-unit";
});

describe("platform gateway allow-list", () => {
  it.each([
    [["organizations"], "/platform/organizations"],
    [["organizations", "acme"], "/platform/organizations/acme"],
    [
      ["organizations", "acme", "suspend"],
      "/platform/organizations/acme/suspend",
    ],
    [
      ["organizations", "acme", "whatsapp"],
      "/platform/organizations/acme/whatsapp",
    ],
    [
      ["organizations", "acme", "deletion"],
      "/platform/organizations/acme/deletion",
    ],
    [
      ["organizations", "acme", "delete"],
      "/platform/organizations/acme/delete",
    ],
    [["organizations", "acme", "users"], "/platform/organizations/acme/users"],
    [
      ["organizations", "acme", "users", ID, "reset-password"],
      `/platform/organizations/acme/users/${ID}/reset-password`,
    ],
    [["integration-keys"], "/platform/integration-keys"],
    [
      ["integration-keys", ID, "revoke"],
      `/platform/integration-keys/${ID}/revoke`,
    ],
    [["admins"], "/platform/admins"],
    [["admins", ID, "reset-mfa"], `/platform/admins/${ID}/reset-mfa`],
    [["admins", ID, "role"], `/platform/admins/${ID}/role`],
    [["audit"], "/platform/audit"],
    [["auth", "me"], "/platform/auth/me"],
    [["auth", "change-password"], "/platform/auth/change-password"],
    [["auth", "recovery-codes"], "/platform/auth/recovery-codes"],
    [["auth", "sessions"], "/platform/auth/sessions"],
    [["auth", "sessions", "end-others"], "/platform/auth/sessions/end-others"],
  ])("allows %j", (segments, expected) => {
    expect(resolvePlatformTarget(segments)).toBe(expected);
  });

  it.each([
    [[]],
    [["auth", "login"]], // sign-in has its own route; the challenge never passes the gateway
    [["auth", "verify"]],
    [["auth", "sessions", ID]],
    [["auth", "me", "sessions"]],
    [["leads"]], // tenant resources are not reachable through the console
    [["organizations", "acme", "export"]],
    [["organizations", "acme", "users", "not-a-uuid", "unlock"]],
    [["organizations", "acme", "users", ID, "delete"]],
    [["integration-keys", ID, "create"]],
    [["admins", ID, "promote"]],
    [["organizations", ".."]],
    [["organizations", "a%2Fb"]],
  ])("refuses %j", (segments) => {
    expect(resolvePlatformTarget(segments)).toBeNull();
  });

  it("the company gateway can't reach the console", () => {
    expect(resolveTarget(["platform", "organizations"])).toBeNull();
  });
});

describe("platform session cookie", () => {
  async function requestWith(name: string, value: string) {
    return new NextRequest("http://app.test/api/platform/lf/admins", {
      headers: { cookie: `${name}=${value}` },
    });
  }

  it("round-trips and is not readable as a company session", async () => {
    const res = await setPlatformSession(
      NextResponse.json({}),
      "plt-token",
      3600,
    );
    const value = res.cookies.get(platformCookieName())!.value;
    const session = await readPlatformSession(
      await requestWith(platformCookieName(), value),
    );
    expect(session?.at).toBe("plt-token");
    expect(await openSession(value)).toBeNull();
  });

  it("a company session cookie is not readable as a platform session", async () => {
    const company = await sealSession({
      at: "a",
      rt: "r",
      ate: Date.now() + 1e6,
    });
    expect(
      await readPlatformSession(
        await requestWith(platformCookieName(), company),
      ),
    ).toBeNull();
  });

  it("is httpOnly and SameSite=Strict", async () => {
    const res = await setPlatformSession(NextResponse.json({}), "t", 60);
    const header = res.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=strict/i);
  });
});
