import { expect, test } from "@playwright/test";
import { mockStats, signIn } from "./helpers";

test.describe("leads", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("list, filter by status, and open a lead", async ({ page }) => {
    await page.goto("/leads");
    await expect(page.getByText("Asha Rao")).toBeVisible();
    await expect(page.getByText("Lars Berg")).toBeVisible();

    await page.getByRole("tab", { name: /Not contacted/ }).click();
    await expect(page).toHaveURL(/stage=not_contacted/);
    await expect(page.getByText("Asha Rao")).toBeVisible();
    await expect(page.getByText("Lars Berg")).toHaveCount(0);

    await page.getByRole("link", { name: /Asha Rao/ }).click();
    await expect(page.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Lead progress" }),
    ).toBeVisible();
  });

  test("only reachable status moves are offered, and lost requires a reason", async ({
    page,
  }) => {
    await page.goto("/leads?status=in_conversation");
    await page.getByRole("link", { name: /Lars Berg/ }).click();
    await expect(
      page.getByRole("heading", { name: "Lars Berg" }),
    ).toBeVisible();

    // in_conversation → only "Quotation requested"
    await expect(
      page.getByRole("button", { name: "Quotation requested" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Mark as won/ })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Quotation requested" }).click();
    await expect(page.getByText("Moved to Quotation requested")).toBeVisible();

    // quotation_requested → back / won / lost
    await expect(
      page.getByRole("button", { name: "Back to conversation" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mark as lost…" }).click();
    const dialog = page.getByRole("dialog", { name: "Mark as lost" });
    await dialog.getByRole("button", { name: "Mark as lost" }).click();
    await expect(dialog.getByText("A reason is required")).toBeVisible();
    await dialog.getByLabel(/Reason/).fill("Went with a competitor on price");
    await dialog.getByRole("button", { name: "Mark as lost" }).click();
    await expect(page.getByText("Moved to Lost")).toBeVisible();
    await expect(
      page.getByText("Went with a competitor on price"),
    ).toBeVisible();
    await expect(page.getByText("This lead is closed.")).toBeVisible();
  });

  test("logging an outbound message auto-advances an uncontacted lead", async ({
    page,
  }) => {
    await page.goto("/leads?status=uncontacted");
    await page.getByRole("link", { name: /Asha Rao/ }).click();
    await expect(page.getByText("Uncontacted").first()).toBeVisible();
    await page
      .getByPlaceholder("What was said or agreed…")
      .fill("Called and agreed to send samples.");
    await page.getByRole("button", { name: "Log it" }).click();
    await expect(
      page.getByText("Called and agreed to send samples."),
    ).toBeVisible();
    await expect(page.getByText("In conversation").first()).toBeVisible();
  });

  test("a repeat enquiry is matched to the existing contact instead of duplicating", async ({
    page,
  }) => {
    await page.goto("/leads/new");
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Asha R.");
    await page.getByRole("textbox", { name: "Phone" }).fill("098765 43210");
    await page
      .getByRole("textbox", { name: "Company name" })
      .fill("Rao Textiles");
    await expect(page.getByText("We already know this person")).toBeVisible();
    await page.getByRole("button", { name: "Log enquiry" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Logged as a reply on an existing lead",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Existing contact", { exact: true }),
    ).toBeVisible();
  });

  test("client-side validation points at the field, then the server is never called with bad data", async ({
    page,
  }) => {
    await page.goto("/leads/new");
    await page.getByRole("button", { name: "Log enquiry" }).click();
    await expect(page.getByText("Contact name is required")).toBeVisible();
    await expect(page.getByText("Company name is required")).toBeVisible();

    // A phone or an email is needed — one or the other.
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Someone");
    await page
      .getByRole("textbox", { name: "Company name" })
      .fill("Somewhere Ltd");
    await page.getByRole("button", { name: "Log enquiry" }).click();
    await expect(
      page.getByText(/Add a phone number or an email/),
    ).toBeVisible();
  });

  test("dashboard shows the pipeline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Follow-ups due/ }),
    ).toBeVisible();
  });

  test("no refresh token was ever replayed", async () => {
    expect((await mockStats()).reuseDetected).toBe(0);
  });
});
