import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Screens for what used to live in n8n data tables. Each goes through the real
 * /api/lf gateway, so a resource missing from its allow-list fails here.
 */
test.describe("automation settings", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("follow-up messages tab loads", async ({ page }) => {
    await page.goto("/follow-ups");
    await page.getByRole("tab", { name: "Messages" }).click();
    await expect(page.getByText("No messages yet")).toBeVisible();
  });

  test("ignored senders page loads", async ({ page }) => {
    await page.goto("/ignored-senders");
    await expect(
      page.getByRole("heading", { name: "Ignored senders" }),
    ).toBeVisible();
    await expect(page.getByText("Nobody is ignored")).toBeVisible();
  });
});
