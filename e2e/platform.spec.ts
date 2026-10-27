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

  test("deleting: schedule with the slug and a fresh code, cancel, then delete after the wait", async ({
    page,
  }) => {
    await platformSignIn(page);
    await page.goto("/platform/organizations/beta-foods");
    const card = page.getByText("Delete organization", { exact: true });
    await expect(card).toBeVisible();

    await page.getByRole("button", { name: "Schedule deletion" }).click();
    const dialog = page.getByRole("dialog");
    const go = dialog.getByRole("button", { name: "Schedule deletion" });
    await dialog.getByLabel("Type beta-foods to confirm").fill("beta-foods");
    await expect(go).toBeDisabled(); // no code yet
    await dialog.getByLabel("Authenticator code").fill("000000");
    await go.click();
    await expect(
      dialog.getByText(/code is wrong or was already used/),
    ).toBeVisible();
    await dialog.getByLabel("Authenticator code").fill(CODE);
    await go.click();
    await expect(page.getByText(/It can be deleted from/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete permanently" }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "Cancel deletion" }).click();
    await page.getByRole("button", { name: "Cancel deletion" }).last().click();
    await expect(
      page.getByRole("button", { name: "Schedule deletion" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Schedule deletion" }).click();
    await dialog.getByLabel("Type beta-foods to confirm").fill("beta-foods");
    await dialog.getByLabel("Authenticator code").fill(CODE);
    await dialog.getByRole("button", { name: "Schedule deletion" }).click();
    await expect(page.getByText(/It can be deleted from/)).toBeVisible();

    // The 7 days pass (mock-only hook).
    const due = await page.request.post(
      "http://127.0.0.1:4010/__platform/due/beta-foods",
    );
    expect(due.ok()).toBe(true);
    await page.reload();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await dialog.getByLabel("Type beta-foods to confirm").fill("beta-foods");
    await dialog.getByLabel("Authenticator code").fill(CODE);
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/platform$/);
    await expect(page.getByRole("link", { name: /Beta Foods/ })).toHaveCount(0);
  });

  test("platform admins: add staff, make an owner with a fresh code, make staff again", async ({
    page,
  }) => {
    await platformSignIn(page);
    await page.getByRole("link", { name: "Platform admins" }).click();
    await page.getByRole("button", { name: "Add platform admin" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Sam Staff");
    await dialog.getByLabel("Email").fill("sam@gmail.com");
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(
      dialog.getByText(/must use an email address ending in/),
    ).toBeVisible();
    await dialog.getByLabel("Email").fill("sam@example.com");
    await dialog.getByRole("button", { name: "Add" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    const row = page.getByRole("listitem").filter({ hasText: "Sam Staff" });
    await expect(row.getByText("Staff", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Make owner" }).click();
    await dialog.getByLabel("Authenticator code").fill(CODE);
    await dialog.getByRole("button", { name: "Make owner" }).click();
    await expect(row.getByText("Owner", { exact: true })).toBeVisible();

    // A forgotten password: the reset needs your own fresh code too.
    await row.getByRole("button", { name: "Reset password" }).click();
    await expect(
      dialog.getByRole("button", { name: "Reset password" }),
    ).toBeDisabled();
    await dialog.getByLabel("Authenticator code").fill(CODE);
    await dialog.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText(/^Temp-/)).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    await row.getByRole("button", { name: "Make staff" }).click();
    await page.getByRole("button", { name: "Make staff" }).last().click();
    await expect(row.getByText("Staff", { exact: true })).toBeVisible();
  });

  test("settings: change password with a fresh code, new recovery codes, sessions", async ({
    page,
  }) => {
    await platformSignIn(page);
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Match device")).toBeVisible();

    await page.getByRole("radio", { name: "Dark" }).click();
    expect(
      await page.evaluate(() => document.documentElement.dataset.theme),
    ).toBe("dark");
    await page.getByRole("radio", { name: "Match device" }).click();

    const password = page
      .locator("form")
      .filter({ has: page.getByLabel("Current password") });
    await password.getByLabel("Current password").fill(OPS_PASSWORD);
    await password.getByLabel("New password").first().fill("x".repeat(14));
    await password.getByLabel("New password again").fill("x".repeat(14));
    const change = password.getByRole("button", { name: "Change password" });
    await expect(change).toBeDisabled();
    await password.getByLabel("Authenticator code").fill(CODE);
    await change.click();
    await expect(page.getByText("Password changed")).toBeVisible();

    const twoStep = page
      .locator("form")
      .filter({ hasText: "Make ten new ones" });
    await twoStep.getByLabel("Authenticator code").fill(CODE);
    await twoStep
      .getByRole("button", { name: "Make new recovery codes" })
      .click();
    await expect(page.getByText("newer-code00")).toBeVisible();
    await page.getByRole("button", { name: "I have saved them" }).click();

    await expect(page.getByText("This device", { exact: true })).toBeVisible();
    await expect(page.getByText("Chrome on Windows").first()).toBeVisible();
    await page
      .getByRole("button", { name: "Sign out everywhere else" })
      .click();
    await page.getByRole("button", { name: "Sign out others" }).click();
    await expect(page.getByText("Chrome on Windows")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Sign out everywhere else" }),
    ).toBeDisabled();
  });

  test("signing out ends the console session", async ({ page }) => {
    await platformSignIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/platform\/login\?reason=signed-out/);
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/platform\/login$/);
  });
});
