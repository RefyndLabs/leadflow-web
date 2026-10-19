import { expect, test, type Page } from "@playwright/test";
import { confirmLead, signIn } from "./helpers";

// 1×1 PNG: enough for the browser to decode and for the (mock) API to store.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function startAtShow(page: Page) {
  await page.goto("/events/capture");
  await page.getByLabel(/^Exhibition/).selectOption({ label: "Gulfood 2026" });
}

async function addFront(page: Page) {
  await page
    .getByLabel("Choose a file", { exact: true })
    .setInputFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
  await expect(
    page.getByRole("button", { name: /^Business card you captured/ }),
  ).toBeVisible();
}

async function addBack(page: Page) {
  await page.getByRole("button", { name: "Add the back of the card" }).click();
  await page
    .getByLabel("Choose a file for the back of the card")
    .setInputFiles({ name: "back.png", mimeType: "image/png", buffer: PNG });
  await expect(
    page.getByRole("button", { name: /^Back of the business card you captured/ }),
  ).toBeVisible();
}

async function saveAndOpen(page: Page) {
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: /Saved/ })).toBeVisible();
  await page.getByRole("link", { name: "Open this capture" }).click();
  await expect(page).toHaveURL(/\/captures\/[0-9a-f-]{36}$/);
}

const captureId = (page: Page) => new URL(page.url()).pathname.split("/").pop()!;

async function readCapture(page: Page, id: string) {
  return (
    await page.request.get(`/api/lf/captures/${id}`, {
      headers: { "x-lf-csrf": "1" },
    })
  ).json();
}

test.describe("two-sided business cards", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("front + back uploaded → both shown on review and on the lead", async ({ page }) => {
    const uploads: string[] = [];
    page.on("request", (r) => {
      const path = new URL(r.url()).pathname;
      if (r.method() === "POST" && /^\/api\/captures\/[^/]+\/(card|card-back|voice)$/.test(path))
        uploads.push(path.split("/").pop()!);
    });

    await startAtShow(page);
    // One-sided cards stay one tap: the back is only offered once the front is there.
    await expect(page.getByRole("button", { name: "Add the back of the card" })).toHaveCount(0);
    await addFront(page);
    await addBack(page);
    await expect(page.getByText("Front of card")).toBeVisible();
    await saveAndOpen(page);
    expect(uploads.sort()).toEqual(["card", "card-back"]);

    // Review: both photos, labelled, plus the text read from the back.
    await expect(page.getByLabel(/^Name/).first()).toHaveValue("Mr Lee", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Business card — front — open full size" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Business card — back — open full size" })).toBeVisible();
    await page.getByText("Text read from the back of the card").click();
    await expect(page.getByText("10 Anson Road, Singapore")).toBeVisible();
    await expect(page.getByText("Text read from the front of the card")).toBeVisible();

    await page.goto("/captures");
    await expect(page.getByText("2 sides").first()).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel(/^Name/).first()).toHaveValue("Mr Lee", { timeout: 15_000 });

    await confirmLead(page);
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    // The first message carries both photos, each labelled with its side.
    await expect(page.getByRole("button", { name: "Front of card — open full size" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back of card — open full size" })).toBeVisible();
    // "From the show" shows both sides too.
    await expect(page.getByRole("button", { name: "Business card — front — open full size" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Business card — back — open full size" })).toBeVisible();
  });

  test("a back-only capture submits and the queue shows the back", async ({ page }) => {
    await startAtShow(page);
    await addFront(page);
    await addBack(page);
    await page.getByRole("button", { name: "Retake", exact: true }).click(); // drop the front, keep the back
    await expect(page.getByRole("button", { name: /^Business card you captured/ })).toHaveCount(0);
    await saveAndOpen(page);
    const id = captureId(page);
    await expect(page.getByLabel(/^Name/).first()).toHaveValue("Mr Lee", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Business card — back — open full size" })).toBeVisible();
    const cap = await readCapture(page, id);
    expect(cap.card).toBeNull();
    expect(cap.card_back).not.toBeNull();
    expect(cap.status).toBe("ready_for_review");

    await page.goto("/captures");
    await expect(page.locator(`a[href="/captures/${id}"] img[src="/api/attachments/${cap.card_back.id}"]`)).toBeVisible();
  });

  test("removing the back on the booth screen, and Not needed, leave a one-sided card", async ({ page }) => {
    await startAtShow(page);
    await addFront(page);
    await page.getByRole("button", { name: "Add the back of the card" }).click();
    await page.getByRole("button", { name: "Not needed" }).click();
    await addBack(page);
    await page.getByRole("button", { name: "Remove the back of the card" }).click();
    await expect(page.getByRole("button", { name: "Add the back of the card" })).toBeVisible();
    await saveAndOpen(page);
    const cap = await readCapture(page, captureId(page));
    expect(cap.card).not.toBeNull();
    expect(cap.card_back).toBeNull();
  });

  test("review: adding the back warns, sends it back to draft, and it can be read again and removed", async ({ page }) => {
    await startAtShow(page);
    await addFront(page);
    await saveAndOpen(page);
    const id = captureId(page);
    await expect(page.getByLabel(/^Name/).first()).toHaveValue("Mr Lee", { timeout: 15_000 });
    await page.getByLabel(/^Name/).first().fill("Mr Lee Senior");

    await page.getByRole("button", { name: "Add the back of the card" }).click();
    await page
      .getByLabel("Choose a file for the back of the card")
      .setInputFiles({ name: "back.png", mimeType: "image/png", buffer: PNG });
    const warn = page.getByRole("alertdialog");
    await expect(warn).toContainText("sends this capture back to draft");
    await warn.getByRole("button", { name: "Add photo" }).click();

    await expect(page.getByRole("button", { name: "Business card — back — open full size" })).toBeVisible();
    await expect(page.getByLabel(/^Name/).first()).toHaveValue("Mr Lee Senior"); // the form was kept
    expect((await readCapture(page, id)).status).toBe("draft");

    await page.getByRole("button", { name: "Send for reading" }).click();
    await expect(page.getByText("Text read from the back of the card")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Remove the back" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove photo" }).click();
    await expect(page.getByRole("button", { name: "Business card — back — open full size" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Business card — open full size" })).toBeVisible();
    const cap = await readCapture(page, id);
    expect(cap.card_back).toBeNull();
    expect(cap.status).toBe("draft");
  });
});

test("the card-back upload route needs the CSRF header and a form upload", async ({ page, request, baseURL }) => {
  await signIn(page);
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const id = "3f2c1e9a-1111-4222-8333-444455556666";
  const noCsrf = await request.post(`${baseURL}/api/captures/${id}/card-back`, {
    headers: { cookie, origin: baseURL! },
    multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(noCsrf.status()).toBe(403);
  const notMultipart = await request.post(`${baseURL}/api/captures/${id}/card-back`, {
    headers: { cookie, origin: baseURL!, "x-lf-csrf": "1", "content-type": "application/json" },
    data: {},
  });
  expect(notMultipart.status()).toBe(415);
  const anon = await request.post(`${baseURL}/api/captures/${id}/card-back`, {
    headers: { origin: baseURL!, "x-lf-csrf": "1" },
    multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(anon.status()).toBe(401);
});
