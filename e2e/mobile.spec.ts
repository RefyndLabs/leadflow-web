import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("phone layout", () => {
  test("uses a bottom tab bar, keeps 44px touch targets and never scrolls sideways", async ({
    page,
  }) => {
    await signIn(page);
    const tabs = page.getByRole("navigation", { name: "Main" });
    await expect(tabs).toBeVisible();
    for (const name of ["Home", "Leads", "Contacts", "Follow-ups", "More"]) {
      const box = await tabs.getByText(name, { exact: true }).boundingBox();
      expect(box, name).toBeTruthy();
    }
    const tab = await tabs.getByRole("link", { name: "Leads" }).boundingBox();
    expect(tab!.height).toBeGreaterThanOrEqual(44);

    for (const path of [
      "/",
      "/leads",
      "/contacts",
      "/follow-ups",
      "/leads/new",
    ]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1);
    }
  });

  test("More opens a sheet with the remaining sections and sign out", async ({
    page,
  }) => {
    await signIn(page);
    await page.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("link", { name: "API keys" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });
});
