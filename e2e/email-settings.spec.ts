import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Settings → Email through the real /api/lf gateway. The mock skips Google's consent screen:
 * "Connect" sends the browser straight back with ?connected=, as the API's OAuth callback does.
 * Tests share one mock API, so they run in order and each leaves the next its starting point.
 */
test.describe.serial("email settings", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/settings/email");
  });

  test("shows the connected mailbox and saves which tabs to skip", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { name: "Email" })).toBeVisible();
    const row = page.getByRole("listitem").filter({
      hasText: "sales@acme-exports.example.com",
    });
    await expect(row.getByText("Sends from here")).toBeVisible();
    const updates = row.getByRole("checkbox", { name: "Updates" });
    await expect(updates).not.toBeChecked();
    await updates.check();
    await expect(page.getByText("Mailbox updated")).toBeVisible();
    await expect(updates).toBeChecked();
  });

  test("connecting comes back with a notice and the new mailbox", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Connect another" }).click();
    await expect(
      page.getByText("Connected enquiries1@acme-exports.example.com."),
    ).toBeVisible();
    // The notice is read once; the address bar is cleaned so a reload doesn't repeat it.
    await expect(page).toHaveURL(/\/settings\/email$/);
    const row = page.getByRole("listitem").filter({
      hasText: "enquiries1@acme-exports.example.com",
    });
    await row.getByRole("button", { name: "Send from this mailbox" }).click();
    await expect(row.getByText("Sends from here")).toBeVisible();
  });

  test("a failed connection explains why", async ({ page }) => {
    await page.goto("/settings/email?error=in_use");
    await expect(
      page.getByText("already connected to another Leadflow workspace"),
    ).toBeVisible();
  });

  test("disconnecting asks first, then removes the mailbox", async ({
    page,
  }) => {
    for (const address of [
      "enquiries1@acme-exports.example.com",
      "sales@acme-exports.example.com",
    ]) {
      const row = page.getByRole("listitem").filter({ hasText: address });
      await row.getByRole("button", { name: "Disconnect" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Disconnect" })
        .click();
      await expect(row).toHaveCount(0);
    }
    await expect(page.getByText("No mailbox connected")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Connect Gmail" }),
    ).toBeVisible();
  });
});
