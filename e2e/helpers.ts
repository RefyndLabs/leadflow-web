import { expect, type Page } from "@playwright/test";

export const EMAIL = "admin@example.com";
export const PASSWORD = "correct horse battery staple 1!";
export const API = "http://127.0.0.1:4010";

export async function signIn(page: Page, next = "/") {
  await page.goto(next);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
}

/**
 * Confirms a capture as a new enquiry. Tests share one mock API, so "Mr Lee" may already have an open
 * lead from an earlier test, and the duplicate check then recommends adding to it (the product working
 * as designed). Wait for any re-check after an edit (debounced 600 ms), then choose "New enquiry".
 */
export async function confirmLead(page: Page) {
  await page.waitForTimeout(800);
  await page.waitForLoadState("networkidle");
  const fresh = page.getByRole("radio", { name: /New enquiry/ });
  if (await fresh.isVisible().catch(() => false)) await fresh.check();
  await page.getByRole("button", { name: "Confirm lead" }).click();
}

export async function mockStats(): Promise<{
  logins: number;
  refreshes: number;
  reuseDetected: number;
}> {
  return (await fetch(`${API}/__stats`)).json();
}
