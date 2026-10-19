import { expect, test, type Page } from "@playwright/test";
import { confirmLead, signIn } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Records every camera stream the page opens, so a test can prove the camera was switched off again. */
async function trackStreams(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __streams: MediaStream[] };
    w.__streams = [];
    const md = navigator.mediaDevices;
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      const s = await original(c);
      w.__streams.push(s);
      return s;
    };
  });
}
const cameraStates = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) =>
      s.getTracks().map((t) => t.readyState),
    ),
  );

async function startCapture(page: Page, show: "Gulfood 2026" | "none") {
  await page.goto("/events/capture");
  await page
    .getByLabel(/^Exhibition/)
    .selectOption(show === "none" ? { value: "none" } : { label: show });
  await page
    .getByLabel("Choose a file")
    .setInputFiles({ name: "card.png", mimeType: "image/png", buffer: PNG });
  await expect(
    page.getByRole("button", { name: /Business card you captured/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: /Saved/ })).toBeVisible();
  await page.getByRole("link", { name: "Open this capture" }).click();
  await expect(page.getByLabel(/^Name/).first()).toHaveValue("Mr Lee", {
    timeout: 15_000,
  });
}

test.describe("Take photo on a laptop opens a real camera", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("live preview → Capture becomes the card photo, and the camera is switched off", async ({
    page,
  }) => {
    await trackStreams(page);
    await page.goto("/events/capture");
    await page.getByRole("button", { name: "Take photo" }).click();

    const dialog = page.getByRole("dialog", {
      name: "Take a photo of the card",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Live camera preview")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Capture" })).toBeFocused(); // Enter / Space takes the photo
    await expect.poll(() => cameraStates(page)).toContain("live");

    await dialog.getByRole("button", { name: "Capture" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Business card you captured/ }),
    ).toBeVisible();
    await expect
      .poll(async () => (await cameraStates(page)).every((s) => s === "ended"))
      .toBe(true);
    await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  });

  test("Cancel and Escape both switch the camera off", async ({ page }) => {
    await trackStreams(page);
    await page.goto("/events/capture");
    for (const how of ["cancel", "escape"] as const) {
      await page.getByRole("button", { name: "Take photo" }).click();
      const dialog = page.getByRole("dialog", {
        name: "Take a photo of the card",
      });
      await expect(dialog).toBeVisible();
      if (how === "cancel")
        await dialog.getByRole("button", { name: "Cancel" }).click();
      else await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(async () =>
          (await cameraStates(page)).every((s) => s === "ended"),
        )
        .toBe(true);
    }
    await expect(
      page.getByRole("button", { name: /Business card you captured/ }),
    ).toHaveCount(0);
  });

  test("permission refused → clear message, and Choose a file still works", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException("denied", "NotAllowedError"));
    });
    await page.goto("/events/capture");
    await page.getByRole("button", { name: "Take photo" }).click();
    await expect(page.getByText(/Camera access is blocked/)).toBeVisible();
    await page
      .getByLabel("Choose a file")
      .setInputFiles({ name: "card.png", mimeType: "image/png", buffer: PNG });
    await expect(
      page.getByRole("button", { name: /Business card you captured/ }),
    ).toBeVisible();
  });

  test("no camera on the device → says so and points at Choose a file", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.enumerateDevices = async () => [];
    });
    await page.goto("/events/capture");
    await page.getByRole("button", { name: "Take photo" }).click();
    await expect(
      page.getByText(
        "No camera found on this device — choose a photo instead.",
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Choose a file")).toBeEnabled();
  });
});

test.describe("'Not from a show' really means not from a show", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("captured without a show → In person on the lead and its first message", async ({
    page,
  }) => {
    await startCapture(page, "none");
    await expect(page.getByText(/saved as\s+In person/i)).toBeVisible(); // the hint explains what no show means
    await confirmLead(page);

    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    await expect(page.getByText("In person").first()).toBeVisible(); // lead header
    await expect(page.getByText(/Exhibition · /)).toHaveCount(0);
    await expect(page.getByText(/In person · \d/)).toBeVisible(); // first message channel, not blank
  });

  test("captured WITH a show, then 'Not from a show' at review → In person, empty exhibition", async ({
    page,
  }) => {
    await startCapture(page, "Gulfood 2026");
    await expect(page.getByLabel("Exhibition")).not.toHaveValue(""); // starts from the capture's own show
    await page.getByLabel("Exhibition").selectOption("");
    await confirmLead(page);

    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    await expect(page.getByText("In person").first()).toBeVisible();
    const exhibition = page
      .locator("dt", { hasText: "Exhibition" })
      .locator("xpath=following-sibling::dd");
    await expect(exhibition).toHaveText("—");
  });

  test("confirmed with a show → an Exhibition lead tagged to it", async ({
    page,
  }) => {
    await startCapture(page, "Gulfood 2026");
    await confirmLead(page);
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    await expect(page.locator("main header")).toContainText("Exhibition");
    await expect(
      page
        .locator("dt", { hasText: "Exhibition" })
        .locator("xpath=following-sibling::dd"),
    ).toHaveText("Gulfood 2026");
  });

  test("with no exhibitions and no products the form explains both, and Confirm still works", async ({
    page,
  }) => {
    await page.goto("/events/capture");
    await page.getByLabel(/^Exhibition/).selectOption({ value: "none" });
    await page
      .getByLabel("Choose a file")
      .setInputFiles({ name: "card.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Done" }).click();
    const href = await page
      .getByRole("link", { name: "Open this capture" })
      .getAttribute("href");

    // This organization has defined no exhibitions or products yet.
    for (const resource of ["events", "products"]) {
      await page.route(`**/api/lf/${resource}?*`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "x-total-count": "0" },
          body: "[]",
        }),
      );
    }
    await page.goto(href!);
    await expect(page.getByLabel(/^Name/).first()).toHaveValue("Mr Lee", {
      timeout: 15_000,
    });

    await expect(
      page.getByText(/No exhibitions yet\. Leads without one are saved as/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add an exhibition" }),
    ).toBeVisible(); // admin has events:write
    await expect(
      page.getByText(/No products in your catalogue yet — this is optional\./),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add products" }),
    ).toBeVisible();
    await confirmLead(page);
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
  });

  test("In person is offered in the leads filter and the message channel picker", async ({
    page,
  }) => {
    await page.goto("/leads");
    await page.getByRole("button", { name: /Filters/ }).click();
    await expect(
      page.getByLabel("Source").locator("option", { hasText: "In person" }),
    ).toHaveCount(1);
    await page.getByRole("link", { name: /Lars Berg/ }).click();
    await expect(
      page.getByLabel("Channel").locator("option", { hasText: "In person" }),
    ).toHaveCount(1);
  });
});

test.describe("international phone numbers", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("numbers show grouped, the Call link keeps the country code, existing contacts show +91", async ({
    page,
  }) => {
    await page.goto("/contacts");
    await expect(page.getByText(/\+91 98765 43210/)).toBeVisible();

    await startCapture(page, "none");
    await confirmLead(page);
    const call = page.getByRole("link", { name: "Call +65 9123 4567" });
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute("href", "tel:+6591234567");
  });

  test("the organization's country decides how a number without a code is read, and every phone input says so", async ({
    page,
  }) => {
    await page.goto("/settings/organization");
    const country = page.getByLabel("Default country for phone numbers");
    await expect(country.locator("option").first()).toHaveText(
      "Default (India)",
    );
    await country.selectOption("AE");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();

    try {
      await page.goto("/leads/new");
      await expect(
        page.getByText(
          "Add the country code for numbers outside United Arab Emirates, e.g. +65 9123 4567.",
        ),
      ).toBeVisible();

      await startCapture(page, "none");
      await expect(
        page.getByText(/outside United Arab Emirates/),
      ).toBeVisible();
      await page.getByLabel(/^Phone/).fill("050 123 4567");
      await confirmLead(page);
      await expect(
        page.getByRole("link", { name: "Call +971 50 123 4567" }),
      ).toBeVisible();
    } finally {
      await page.goto("/settings/organization");
      await page
        .getByLabel("Default country for phone numbers")
        .selectOption("");
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Settings saved")).toBeVisible();
    }
  });

  test("contact search ignores a trunk 0 typed before the number", async ({
    page,
  }) => {
    await page.goto("/contacts");
    await page.getByLabel("Search contacts").fill("098765 43210");
    await expect(page.getByText("Asha Rao")).toBeVisible();
    await expect(page.getByText("Lars Berg")).toHaveCount(0);
  });
});
