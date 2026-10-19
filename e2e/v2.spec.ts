import { expect, test, type Page } from "@playwright/test";
import { API, signIn } from "./helpers";

/** Opens Asha Rao's lead from the list and returns its id. */
async function openAsha(page: Page): Promise<string> {
  await page.goto("/leads?q=Asha");
  await page.getByRole("link", { name: /Asha Rao/ }).first().click();
  await expect(page.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
  return page.url().split("/").pop()!;
}

/** Logs a brand-new enquiry by hand (no research is queued for it) and opens it. Returns its id. */
async function newLead(page: Page, name: string, company: string): Promise<string> {
  await page.goto("/leads/new");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "Email" }).fill(`${name.split(" ")[0]!.toLowerCase()}@${company.split(" ")[0]!.toLowerCase()}.example`);
  await page.getByRole("textbox", { name: "Company name" }).fill(company);
  await page.getByRole("button", { name: "Log enquiry" }).click();
  await expect(page.getByRole("heading", { name: "New lead created" })).toBeVisible();
  await page.getByRole("link", { name: "Open lead" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return page.url().split("/").pop()!;
}

/** Mock-only hook: puts the lead's newest research run into a state. */
async function setResearch(leadId: string, body: Record<string, unknown>) {
  const r = await fetch(`${API}/__research/${leadId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(r.ok).toBe(true);
}

test.describe("capture v2", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("lead list filters round-trip through the URL", async ({ page }) => {
    await page.goto("/leads");
    await page.getByRole("button", { name: /^Filters/ }).click();
    const rating = page.getByRole("group", { name: "Your rating" });
    await rating.getByRole("button", { name: /^Hot/ }).click();
    await expect(page).toHaveURL(/quality_tag=hot/);
    await expect(page.getByRole("link", { name: /Lars Berg/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Asha Rao/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove filter: Rated Hot" })).toBeVisible();

    // The view is the URL: a fresh page load (or a shared link) shows the same thing.
    const shared = page.url();
    await page.goto("about:blank");
    await page.goto(shared);
    await expect(page.getByRole("link", { name: /Lars Berg/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Asha Rao/ })).toHaveCount(0);

    // Search joins in, and removing a chip removes just that filter.
    await page.getByLabel("Search leads").fill("Lars");
    await expect(page).toHaveURL(/q=Lars/);
    await page.getByRole("button", { name: "Remove filter: Rated Hot" }).click();
    await expect(page).not.toHaveURL(/quality_tag/);
    await expect(page).toHaveURL(/q=Lars/);

    // Saved views replace the filters in one tap.
    await page.getByRole("button", { name: "Hot, not contacted" }).click();
    await expect(page).toHaveURL(/qualification=hot/);
    await expect(page).toHaveURL(/stage=not_contacted/);
    await expect(page).not.toHaveURL(/q=Lars/);
    await page.getByRole("button", { name: "Clear all" }).first().click();
    await expect(page).toHaveURL(/\/leads$/);
  });

  test("qualification panel: none → researching → failed → completed", async ({ page }) => {
    const id = await newLead(page, "Naysheel Kant", "Refynd Tech Consulting");
    const panel = page.getByRole("region", { name: "AI qualification" });

    // None yet
    await expect(panel.getByText("Not researched yet")).toBeVisible();
    await panel.getByRole("button", { name: "Research this lead" }).click();
    // Requested / processing
    await expect(panel.getByText("Researching… (usually a few minutes)")).toBeVisible();

    // Failed
    await setResearch(id, { status: "failed", error: "The company website did not respond." });
    await page.reload();
    await expect(panel.getByText("Research failed.")).toBeVisible();
    await expect(panel.getByText("The company website did not respond.")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Try again" })).toBeVisible();

    // Completed (the screenshot's lead)
    await setResearch(id, {
      status: "completed",
      result: {
        score: 47,
        confidence: 0.7,
        headline: "Low product fit; tech firm, but tea inquiry.",
        summary: "A developer from a tech firm inquired about herbal tea exports.",
        breakdown: { value_potential: 20, purchase_intent: 60, product_fit: 40, engagement: 80 },
        score_reasons: ["Tea inquiry deviates from their core tech business."],
        confirmed_facts: ["They inquired about herbal tea exports."],
        possible_inferences: ["Personal interest in herbal tea."],
        risks: ["No company website found."],
        product_matches: [{ name: "Cold-pressed oil", fit: "medium", reason: "Adjacent category" }],
        recommended_next_action: "Call to clarify whether this is for a business.",
        suggested_questions: ["Is this for your company or a new venture?"],
        sources: [{ title: "Company profile", url: "https://example.com/profile" }],
      },
    });
    await page.reload();
    await expect(panel.getByText(/^47\s*\/\s*100$/)).toBeVisible();
    await expect(panel.getByText("70% confidence")).toBeVisible();
    await expect(panel.getByText("Low product fit; tech firm, but tea inquiry.")).toBeVisible();
    await expect(panel.getByText("Value potential")).toBeVisible();
    await expect(panel.getByText("Product fit", { exact: true })).toBeVisible();
    await expect(panel.getByText("Information", { exact: true })).toHaveCount(0); // missing sub-scores are left out
    await expect(panel.getByText("They inquired about herbal tea exports.")).toBeVisible();
    await expect(panel.getByText("Personal interest in herbal tea.")).toBeVisible();
    await expect(panel.getByText("No company website found.")).toBeVisible();
    await expect(panel.getByRole("link", { name: /Company profile/ })).toHaveAttribute("href", "https://example.com/profile");
    await expect(panel.getByText(/AI suggestion from public information/)).toBeVisible();

    // The person's rating stays theirs until they take the AI's.
    await expect(panel.getByText(/AI score 47 \(warm\) · Your rating:/)).toBeVisible();
    await panel.getByRole("button", { name: "Use AI rating" }).click();
    await expect(panel.getByRole("button", { name: "Use AI rating" })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Research again" })).toBeVisible();
  });

  test("lead page: promises, export details, products and pausing follow-ups", async ({ page }) => {
    await openAsha(page);

    // A promise with a due date, then kept.
    await page.getByRole("button", { name: "Add a note or promise" }).click();
    await page.getByRole("radio", { name: "Promise" }).click();
    await page.getByLabel("What we promised").fill("Send the cotton yarn price list");
    await page.getByLabel("Due").fill("2030-01-15T10:00");
    await page.getByRole("button", { name: "Add promise" }).click();
    await expect(page.getByText("Promise added")).toBeVisible();
    await page.getByRole("checkbox", { name: "Mark done: Send the cotton yarn price list" }).check();
    await expect(page.getByRole("checkbox", { name: "Re-open: Send the cotton yarn price list" })).toBeChecked();

    // Export details edit in place.
    await page.getByRole("button", { name: "Edit export details" }).click();
    const dialog = page.getByRole("dialog", { name: "Export details" });
    await dialog.getByLabel("Buyer type").selectOption("wholesaler");
    await dialog.getByLabel("Incoterm").fill("fob");
    await dialog.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Export details saved")).toBeVisible();
    await expect(page.getByText("Wholesaler")).toBeVisible();
    await expect(page.getByText("FOB", { exact: true })).toBeVisible();

    // Pause automated follow-ups.
    await page.getByRole("checkbox", { name: /Pause automated follow-ups/ }).check();
    await expect(page.getByText("Automated follow-ups paused")).toBeVisible();
    await expect(page.getByText("Follow-ups paused", { exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: /Pause automated follow-ups/ }).uncheck();
    await expect(page.getByText("Automated follow-ups resumed")).toBeVisible();
  });

  test("a confirmed review goes to the lead and Back doesn't return to the form", async ({ page }) => {
    await page.goto("/events/capture");
    await page.getByLabel("Quick note").fill("Met at the hotel lobby");
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("link", { name: "Open this capture" }).click();
    await expect(page).toHaveURL(/\/captures\/[0-9a-f-]{36}$/);
    await page.getByLabel(/^Name/).first().fill("Rhea Lobby");
    await page.getByLabel("Email").fill("rhea@lobby.example");
    await page.getByLabel("Company name").fill("Lobby Imports");
    await page.getByRole("button", { name: "Confirm lead" }).click();

    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Rhea Lobby" })).toBeVisible();
    await page.goBack();
    await expect(page).not.toHaveURL(/\/captures\//);
  });

  test("the booth pre-selects the show you're working and shows its stand", async ({ page }) => {
    await page.goto("/events/capture");
    const show = page.getByLabel(/^Exhibition/);
    await expect(show.locator("option:checked")).toHaveText("Spice Expo Live — you're on the team");
    await expect(page.getByText("Stand Hall 3, B-12")).toBeVisible();
    await show.selectOption({ value: "none" });
    await expect(page.getByText("Not at a show (office / factory visit)")).toBeVisible();
  });

  test("exhibitions: timing tabs, detail page with team and performance", async ({ page }) => {
    await page.goto("/events");
    await page.getByRole("tab", { name: "Happening now" }).click();
    await expect(page).toHaveURL(/timing=ongoing/);
    await expect(page.getByRole("link", { name: /Spice Expo Live/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Gulfood 2026/ })).toHaveCount(0);
    await page.getByRole("link", { name: /Spice Expo Live/ }).click();
    await expect(page.getByRole("heading", { name: "Spice Expo Live" })).toBeVisible();
    await expect(page.getByText("Ada Admin (you)")).toBeVisible();
    await expect(page.getByText("Captures to review")).toBeVisible();
    await expect(page.getByRole("link", { name: "View leads" })).toHaveAttribute("href", /event_id=/);
  });
});
