import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { API, signIn } from "./helpers";

/** Logs a brand-new enquiry by hand and opens it. Returns its id. */
async function newLead(
  page: Page,
  name: string,
  company: string,
  phone?: string,
): Promise<string> {
  await page.goto("/leads/new");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  const first = name.split(" ")[0]!.toLowerCase();
  await page
    .getByRole("textbox", { name: "Email" })
    .fill(`${first}@${company.split(" ")[0]!.toLowerCase()}.example`);
  if (phone) await page.getByLabel(/^Phone/).fill(phone);
  await page.getByRole("textbox", { name: "Company name" }).fill(company);
  await page.getByRole("button", { name: "Log enquiry" }).click();
  await expect(
    page.getByRole("heading", { name: "New lead created" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open lead" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return page.url().split("/").pop()!;
}

/** Mock-only hook: plays the writing workflow by putting the lead's first message into a state. */
async function setFirstTouch(leadId: string, body: Record<string, unknown>) {
  const r = await fetch(`${API}/__outreach/${leadId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(r.ok).toBe(true);
}

const card = (page: Page) =>
  page.getByRole("region", { name: "First message" });

test.describe("the personalised first message", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("asked for, written, checked, edited and approved", async ({ page }) => {
    const leadId = await newLead(page, "Nina Patel", "Patel Foods");
    await card(page)
      .getByRole("button", { name: "Write first message" })
      .click();
    await expect(
      card(page).getByText("Writing a personal message…"),
    ).toBeVisible();

    await setFirstTouch(leadId, {
      status: "draft_ready",
      whatsapp_text: "Hi Nina, lovely to meet you.",
      email_subject: "Your enquiry about turmeric",
      email_body: "Dear Nina,\n\nThank you for stopping by.\n\nBest regards",
      draft: {
        suggested_channel: "email",
        personalised_on: ["asked about turmeric 3% curcumin"],
        review_notes: ["No quantity was mentioned"],
      },
    });
    await page.reload();
    const fm = card(page);
    await expect(fm.getByText("Check before sending")).toBeVisible();
    await expect(fm.getByText("No quantity was mentioned")).toBeVisible();
    await expect(
      fm.getByText("asked about turmeric 3% curcumin"),
    ).toBeVisible();
    // No phone: email is chosen, and WhatsApp says why it can't be used.
    await expect(fm.getByRole("radio", { name: "Email" })).toBeChecked();
    await expect(fm.getByLabel("Subject")).toHaveValue(
      "Your enquiry about turmeric",
    );
    await fm.getByRole("radio", { name: "WhatsApp" }).click();
    await expect(fm.getByText(/no phone or WhatsApp number/)).toBeVisible();
    await expect(
      fm.getByRole("button", { name: "Approve and send on WhatsApp" }),
    ).toBeDisabled();

    await fm.getByRole("radio", { name: "Email" }).click();
    await fm.getByLabel("Subject").fill("Turmeric 3% curcumin: our price list");
    await fm.getByRole("button", { name: "Approve and send on email" }).click();
    await expect(fm.getByText("Sending on email…")).toBeVisible();
    await expect(fm.getByText("Thank you for stopping by.")).toBeVisible();
  });

  test("sent from the rep's own WhatsApp and logged on the lead", async ({
    page,
    context,
  }) => {
    await context.route("https://wa.me/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "ok" }),
    );
    const leadId = await newLead(
      page,
      "Omar Haddad",
      "Haddad Trading",
      "+971 50 765 4321",
    );
    await card(page)
      .getByRole("button", { name: "Write first message" })
      .click();
    await setFirstTouch(leadId, {
      status: "draft_ready",
      whatsapp_text: "Hello Omar, great meeting you at Gulfood.",
      draft: { suggested_channel: "whatsapp" },
    });
    await page.reload();
    const fm = card(page);
    await expect(fm.getByRole("radio", { name: "WhatsApp" })).toBeChecked();
    await fm
      .getByLabel("WhatsApp message")
      .fill(
        "Hello Omar, great meeting you at Gulfood. The price list follows today.",
      );

    const popup = context.waitForEvent("page");
    await fm.getByRole("button", { name: "Send from my WhatsApp" }).click();
    const wa = await popup;
    expect(wa.url()).toContain("https://wa.me/971507654321?text=Hello%20Omar");
    await wa.close();

    await page.getByRole("button", { name: "Yes, I sent it" }).click();
    await expect(fm.getByText(/Sent on WhatsApp .* \(by hand\)/)).toBeVisible();
    await expect(
      page.getByText(
        "Hello Omar, great meeting you at Gulfood. The price list follows today.",
      ),
    ).toBeVisible(); // in the conversation
  });

  test("save contact gives a contact card with the person's details", async ({
    page,
  }) => {
    await newLead(page, "Mei Tan", "Tan Imports", "+65 9000 1111");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save contact" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("Mei Tan.vcf");
    const text = await readFile((await file.path())!, "utf8");
    expect(text).toContain("FN:Mei Tan");
    expect(text).toContain("N:Tan;Mei;;;");
    expect(text).toContain("TEL;TYPE=CELL,VOICE:+6590001111");
    expect(text).toContain("EMAIL;TYPE=INTERNET:mei@tan.example");
    expect(text).toContain("ORG:Tan Imports");
  });

  test("the auto-send setting is saved and shown with the other settings", async ({
    page,
  }) => {
    await page.goto("/settings/organization");
    const profile = page.getByLabel("Company profile");
    await profile.fill("We export spices and herbal teas.");
    const auto = page.getByLabel("Send first messages without review");
    await expect(auto).not.toBeChecked();
    await auto.check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
    // The saved values stay on screen (the form is refilled from the server after a save).
    await expect(profile).toHaveValue("We export spices and herbal teas.");
    await expect(auto).toBeChecked();
    await page.reload();
    await expect(page.getByLabel("Company profile")).toHaveValue(
      "We export spices and herbal teas.",
    );
    await expect(
      page.getByLabel("Send first messages without review"),
    ).toBeChecked();

    await page.getByLabel("Send first messages without review").uncheck();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved").first()).toBeVisible();
  });
});
