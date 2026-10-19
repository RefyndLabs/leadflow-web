import { expect, test, type Page } from "@playwright/test";
import { confirmLead, signIn } from "./helpers";

// 1×1 PNG: enough for the browser to decode and for the (mock) API to store.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function addCard(page: Page) {
  await page
    .getByLabel("Choose a file")
    .setInputFiles({ name: "card.png", mimeType: "image/png", buffer: PNG });
  await expect(
    page.getByRole("button", { name: /Business card you captured/ }),
  ).toBeVisible();
}

async function recordVoice(page: Page) {
  await page
    .getByRole("button", { name: "Start recording a voice note" })
    .click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByLabel("Your recording")).toBeVisible();
}

test.describe("capture at a show", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("photo + voice note → saved → read → reviewed → lead with files attached", async ({
    page,
  }) => {
    await page.goto("/events/capture");
    await page
      .getByLabel(/^Exhibition/)
      .selectOption({ label: "Gulfood 2026" });

    // Both ways to add a photo are offered.
    await expect(page.getByText("Take photo")).toBeVisible();
    await expect(page.getByText("Choose a file")).toBeVisible();
    await addCard(page);
    await recordVoice(page);

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("heading", { name: /Saved/ })).toBeVisible();

    // Review: wait for the suggestions to arrive on their own.
    await page.getByRole("link", { name: "Open this capture" }).click();
    await expect(page.getByLabel(/^Name/).first()).toHaveValue("Mr Lee", {
      timeout: 15_000,
    });
    await expect(page.getByLabel("Company name")).toHaveValue(
      "Lee Trading Pte Ltd",
    );
    await expect(page.getByText("Not sure about this one")).toBeVisible(); // low-confidence company name
    await expect(page.getByLabel("Voice note")).toBeVisible();

    // The form arrives filled in from the API's draft, not the raw extraction.
    await expect(page.getByLabel(/^Phone/)).toHaveValue("+6591234567"); // cleaned to one number…
    await expect(page.getByText(/Several phone numbers were read/)).toBeVisible(); // …with a warning
    await expect(page.getByText("Not in the catalogue: saffron")).toBeVisible();
    await expect(page.getByLabel("Country")).toHaveValue("SG");
    const picked = page.getByRole("list", { name: "Selected products" });
    await expect(picked.getByRole("listitem").filter({ hasText: "OIL-001" })).toBeVisible();
    await expect(picked.getByText("Heard in voice note")).toBeVisible();
    await expect(picked.getByText("said: “cold-pressed oil”")).toBeVisible();
    await expect(page.getByLabel("Quantity for Cold-pressed oil")).toHaveValue("10 t / month");
    await expect(page.getByRole("textbox", { name: "Conversation summary" })).toHaveValue(/Who they are: Director/);
    await expect(page.getByRole("textbox", { name: "Promise 1", exact: true })).toHaveValue("Send a price list and COA");
    await expect(page.getByLabel("Buyer type")).toHaveValue("distributor"); // export details open: fields are set
    await page.getByText("In English").click();
    await expect(page.getByText("ten tons of oil every month")).toBeVisible();
    await expect(page.getByLabel("Research this lead after saving")).toBeChecked();

    await confirmLead(page);
    // Confirm replaces the review page with the lead (Back doesn't return to a confirmed capture).
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Mr Lee" })).toBeVisible();
    await expect(page.getByText("Lead created")).toBeVisible();
    // The first message carries the photo and a playable recording.
    await expect(
      page.getByRole("button", { name: /Photo — open full size/ }),
    ).toBeVisible();
    await expect(page.getByLabel("Voice note")).toBeVisible();
    // Everything the review held reached the lead: products, notes and promise, research queued.
    await expect(page.getByRole("link", { name: "Cold-pressed oil" })).toBeVisible();
    await expect(page.getByText("Send a price list and COA").first()).toBeVisible();
    await expect(page.getByText("Researching… (usually a few minutes)")).toBeVisible();
    await expect(page.getByText("Recording from the show")).toHaveCount(0); // it's a label, not text
    await expect(page.getByLabel("Recording from the show")).toBeVisible();
  });

  test("a failed upload keeps the photo and Retry resumes without creating a second capture", async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/captures/*/card", async (route) => {
      calls += 1;
      if (calls === 1)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Storage is busy. Try again." }),
        });
      return route.continue();
    });
    let created = 0;
    page.on(
      "request",
      (r) =>
        r.method() === "POST" &&
        new URL(r.url()).pathname === "/api/lf/captures" &&
        created++,
    );

    await page.goto("/events/capture");
    await page
      .getByLabel(/^Exhibition/)
      .selectOption({ label: "Gulfood 2026" });
    await addCard(page);
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByText("Storage is busy. Try again.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Business card you captured/ }),
    ).toBeVisible(); // nothing lost
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("heading", { name: /Saved/ })).toBeVisible();
    expect(created).toBe(1);
  });

  test("capture another keeps the chosen show; a note-only capture is saved without being sent", async ({
    page,
  }) => {
    await page.goto("/events/capture");
    await page
      .getByLabel(/^Exhibition/)
      .selectOption({ label: "Gulfood 2026" });
    await page.getByLabel("Quick note").fill("Wants samples before the 15th");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByText(/Saved without a photo or recording/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Capture another" }).click();
    await expect(page.getByLabel(/^Exhibition/)).toHaveValue(/[0-9a-f-]{36}/); // remembered
    await expect(page.getByLabel("Quick note")).toHaveValue("");
  });

  test("duplicate check: an existing contact's open lead is recommended, and the rep can override it", async ({
    page,
  }) => {
    await page.goto("/events/capture");
    await page
      .getByLabel(/^Exhibition/)
      .selectOption({ label: "Gulfood 2026" });
    await addCard(page);
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("link", { name: "Open this capture" }).click();
    await expect(page.getByLabel(/^Name/).first()).toBeVisible();

    // Type the phone of a contact we already have.
    await page.getByLabel(/^Name/).first().fill("Asha R.");
    await page.getByLabel("Company name").fill("Rao Textiles");
    await page.getByLabel(/^Phone/).fill("098765 43210");
    // Re-checked as they type (never by re-fetching the capture, which would reset the form).
    await expect(page.getByText("We already know this person")).toBeVisible();
    await expect(page.getByText(/matched on phone/)).toBeVisible();
    const attach = page.getByRole("radio", { name: /Add to this lead/ });
    await expect(attach).toBeChecked(); // the API's recommendation is pre-selected…
    await expect(page.getByText(/Suggested: Known contact/)).toBeVisible(); // …with its reason
    await expect(page.getByLabel(/^Name/).first()).toHaveValue("Asha R."); // edits survived the re-check

    await page.getByRole("radio", { name: /New enquiry/ }).check();
    await attach.check(); // the rep can change their mind either way
    await page.getByRole("button", { name: "Confirm lead" }).click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
  });

  test("queue shows the capture with a thumbnail and the files stream with Range support", async ({
    page,
  }) => {
    await page.goto("/events/capture");
    await page
      .getByLabel(/^Exhibition/)
      .selectOption({ label: "Gulfood 2026" });
    await addCard(page);
    await recordVoice(page);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("heading", { name: /Saved/ })).toBeVisible();
    const id = (await page
      .getByRole("link", { name: "Open this capture" })
      .getAttribute("href"))!
      .split("/")
      .pop()!;

    await page.goto("/captures");
    await expect(
      page.getByRole("link", { name: /Gulfood 2026/ }).first(),
    ).toBeVisible();
    await expect(
      page.locator('main img[src^="/api/attachments/"]').first(),
    ).toBeVisible();

    const cap = await (
      await page.request.get(`/api/lf/captures/${id}`, {
        headers: { "x-lf-csrf": "1" },
      })
    ).json();
    const full = await page.request.get(`/api/attachments/${cap.voice.id}`);
    expect(full.status()).toBe(200);
    expect(full.headers()["content-type"]).toMatch(/^audio\//);
    const part = await page.request.get(`/api/attachments/${cap.voice.id}`, {
      headers: { range: "bytes=0-9" },
    });
    expect(part.status()).toBe(206); // Safari only plays audio when this works
    expect(part.headers()["content-range"]).toMatch(/^bytes 0-9\//);
    expect((await part.body()).length).toBe(10);
  });
});

test.describe("capture endpoints are not an open door", () => {
  test("downloads and uploads need a session; n8n-only verbs and bad requests are refused", async ({
    page,
    request,
    baseURL,
  }) => {
    const anon = await request.get(
      `${baseURL}/api/attachments/3f2c1e9a-1111-4222-8333-444455556666`,
    );
    expect(anon.status()).toBe(401);

    await signIn(page);
    const cookie = (await page.context().cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const id = "3f2c1e9a-1111-4222-8333-444455556666";
    const noCsrf = await request.post(`${baseURL}/api/captures/${id}/card`, {
      headers: { cookie, origin: baseURL! },
      multipart: {
        file: { name: "a.png", mimeType: "image/png", buffer: PNG },
      },
    });
    expect(noCsrf.status()).toBe(403);
    const notMultipart = await request.post(
      `${baseURL}/api/captures/${id}/card`,
      {
        headers: {
          cookie,
          origin: baseURL!,
          "x-lf-csrf": "1",
          "content-type": "application/json",
        },
        data: {},
      },
    );
    expect(notMultipart.status()).toBe(415);
    const badId = await request.get(`${baseURL}/api/attachments/not-a-uuid`, {
      headers: { cookie },
    });
    expect(badId.status()).toBe(404);
    for (const verb of ["claim", "extraction", "fail"]) {
      const r = await request.post(`${baseURL}/api/lf/captures/${id}/${verb}`, {
        headers: { cookie, origin: baseURL!, "x-lf-csrf": "1" },
        data: {},
      });
      expect(r.status(), verb).toBe(404);
    }
  });
});
