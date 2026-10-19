import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, mockStats, signIn } from "./helpers";

test.describe("authentication", () => {
  test("signed-out visitors are sent to the login screen and returned afterwards", async ({
    page,
  }) => {
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/login\?next=%2Fleads/);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/leads$/);
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  });

  test("a wrong password gives a generic message and clears the password field", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel(/^Password/).fill("definitely wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText("That email and password don't match"),
    ).toBeVisible();
    await expect(page.getByLabel(/^Password/)).toHaveValue("");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login never open-redirects", async ({ page }) => {
    await page.goto("/login?next=//evil.example");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    expect(new URL(page.url()).host).toBe("127.0.0.1:3100");
  });

  test("tokens live only in an httpOnly cookie — never in JS-visible storage", async ({
    page,
    context,
  }) => {
    await signIn(page);
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "lf_session");
    expect(session, "session cookie").toBeTruthy();
    expect(session!.httpOnly).toBe(true);
    expect(session!.sameSite).toBe("Lax");
    // No API token is readable by page scripts.
    const visible = await page.evaluate(() => ({
      cookie: document.cookie,
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
    }));
    expect(visible.cookie).not.toContain("lf_session");
    for (const v of Object.values(visible))
      expect(v).not.toMatch(/at_|rt_|eyJ/);
    // The browser never talks to the real API directly.
    const hosts = new Set<string>();
    page.on("request", (r) => hosts.add(new URL(r.url()).host));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    expect([...hosts]).toEqual(["127.0.0.1:3100"]);
  });

  test("the API gateway refuses cross-site style requests", async ({
    page,
    request,
  }) => {
    await signIn(page);
    const cookie = (await page.context().cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const noHeader = await request.post("/api/lf/leads/ingest", {
      headers: { cookie, origin: "http://127.0.0.1:3100" },
      data: {},
    });
    expect(noHeader.status()).toBe(403);
    const foreign = await request.post("/api/lf/leads/ingest", {
      headers: { cookie, origin: "http://evil.example", "x-lf-csrf": "1" },
      data: {},
    });
    expect(foreign.status()).toBe(403);
    const traversal = await request.get("/api/lf/auth/refresh", {
      headers: { cookie, "x-lf-csrf": "1" },
    });
    expect(traversal.status()).toBe(404);
  });

  test("signing out ends the session server-side and returns to login", async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?reason=signed-out/);
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a burst of parallel requests on an expiring token refreshes exactly once and never replays a refresh token", async ({
    page,
  }) => {
    await signIn(page);
    // The mock's tokens live 62 s and the frontend refreshes inside the last 60 s, so 2.5 s in, the cookie is "expiring".
    await page.waitForTimeout(2500);
    const before = await mockStats();

    // Twelve requests fire at once, all carrying the same soon-stale cookie (what a page load does).
    const statuses = await page.evaluate(async () =>
      Promise.all(
        Array.from({ length: 12 }, () =>
          fetch("/api/lf/leads", { headers: { "x-lf-csrf": "1" } }).then(
            (r) => r.status,
          ),
        ),
      ),
    );
    expect(statuses.every((s) => s === 200)).toBe(true);

    const after = await mockStats();
    expect(after.refreshes - before.refreshes).toBe(1); // single-flight: one refresh, not twelve
    expect(after.reuseDetected).toBe(0); // the API never saw a token replayed
    await page.goto("/leads");
    await expect(page).not.toHaveURL(/\/login/); // and the session is still alive on the rotated tokens
  });
});
