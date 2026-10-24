import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

const OPS_EMAIL = "ops@example.com";
const OPS_PASSWORD = "platform passphrase 1!";
const CODE = "123456"; // the mock's authenticator always shows this

/** Password, then the code; on the very first sign-in also the set-up and recovery-code steps. */
async function platformSignIn(page: Page) {
  await page.goto("/platform/login");
  await page.getByLabel("Email").fill(OPS_EMAIL);
  await page.getByLabel(/^Password/).fill(OPS_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").fill(CODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  const saved = page.getByLabel("I have saved my recovery codes");
  const orgs = page.getByRole("heading", { name: "Organizations" });
  await expect(saved.or(orgs)).toBeVisible();
  if (await saved.isVisible()) {
    await saved.check();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(orgs).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("platform console", () => {
  test("the console needs its own sign-in; a company session doesn't open it", async ({
    page,
  }) => {
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/platform\/login$/);
    await signIn(page);
    await page.goto("/platform/admins");
    await expect(page).toHaveURL(/\/platform\/login$/);
    // And the console's gateway refuses the company cookie outright.
    const res = await page.request.get("/api/platform/lf/organizations", {
      headers: { "x-lf-csrf": "1" },
    });
    expect(res.status()).toBe(401);
  });

  test("first sign-in sets up the authenticator and shows recovery codes once", async ({
    page,
  }) => {
    await page.goto("/platform/login");
    await page.getByLabel("Email").fill(OPS_EMAIL);
    await page.getByLabel(/^Password/).fill(OPS_PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Set up two-step sign-in.")).toBeVisible();
    await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();

    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That code isn't right")).toBeVisible();

    await page.getByLabel("6-digit code").fill(CODE);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Two-step sign-in is on.")).toBeVisible();
    const cont = page.getByRole("button", { name: "Continue" });
    await expect(cont).toBeDisabled();
    await page.getByLabel("I have saved my recovery codes").check();
    await cont.click();
    await expect(
      page.getByRole("heading", { name: "Organizations" }),
    ).toBeVisible();
    await expect(page.getByText("Acme Exports")).toBeVisible();
  });

  test("the platform token never reaches the page's JavaScript", async ({
    page,
    context,
  }) => {
    await platformSignIn(page);
    const cookie = (await context.cookies()).find(
      (c) => c.name === "lf_platform",
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "lf_platform",
    );
  });

  test("creating an organization shows its admin's temporary password once", async ({
    page,
  }) => {
    await platformSignIn(page);
    await page.getByRole("button", { name: "New organization" }).click();
    await page.getByLabel("Company name").fill("Beta Foods");
    await expect(page.getByLabel("Short name")).toHaveValue("beta-foods");
    await page.getByLabel("First admin's name").fill("Bea");
    await page.getByLabel("First admin's email").fill("bea@beta.example.com");
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page.getByText("Beta Foods is ready")).toBeVisible();
    await expect(page.getByText(/^Temp-/)).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("link", { name: /Beta Foods/ })).toBeVisible();
  });

  test("organization page: automation, suspend with the slug typed, user password reset", async ({
    page,
  }) => {
    await platformSignIn(page);
    await page.getByRole("link", { name: /Beta Foods/ }).click();
    await expect(
      page.getByRole("heading", { name: "Beta Foods" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Switch on" }).click();
    await expect(
      page.getByRole("button", { name: "Switch off" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Suspend organization" }).click();
    const suspend = page.getByRole("button", { name: "Suspend", exact: true });
    await expect(suspend).toBeDisabled();
    await page.getByLabel("Type beta-foods to confirm").fill("beta-foods");
    await suspend.click();
    await expect(
      page.getByRole("button", { name: "Reactivate organization" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Reset password" }).click();
    await page.getByRole("button", { name: "Reset password" }).last().click();
    await expect(
      page.getByRole("heading", { name: "Temporary password" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByText("Suspended the organization")).toBeVisible();
  });

  test("signing out ends the console session", async ({ page }) => {
    await platformSignIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/platform\/login\?reason=signed-out/);
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/platform\/login$/);
  });
});
