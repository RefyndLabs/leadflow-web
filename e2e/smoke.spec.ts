import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Every screen: loads without console errors or CSP violations, and has no serious/critical
 * WCAG 2 A/AA violations in either colour scheme (contrast included).
 */
const ROUTES = [
  "/",
  "/leads",
  "/leads/new",
  "/leads/import",
  "/contacts",
  "/accounts",
  "/follow-ups",
  "/ignored-senders",
  "/catalog",
  "/catalog?tab=collateral",
  "/events",
  "/events/capture",
  "/captures",
  "/settings/team",
  "/settings/api-keys",
  "/settings/organization",
  "/settings/audit",
  "/settings/profile",
];

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (
      m.type() === "error" ||
      /content security policy|refused to/i.test(m.text())
    )
      problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/api/"))
      problems.push(
        `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`,
      );
  });
  return problems;
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    test(`all screens are clean and accessible (${scheme})`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const problems = watch(page);
      await signIn(page);

      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator("main h1").first()).toBeVisible();
        await page.waitForLoadState("networkidle");

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        const bad = results.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        );
        expect(
          bad.map(
            (v) =>
              `${route}: ${v.id} — ${v.help} (${v.nodes
                .slice(0, 3)
                .map((n) => n.target.join(" "))
                .join(" | ")})`,
          ),
          `${route} accessibility`,
        ).toEqual([]);
      }

      // A lead detail page too (needs a real id).
      await page.goto("/leads");
      await page
        .getByRole("link", { name: /Lars Berg|Asha Rao/ })
        .first()
        .click();
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      const detail = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        detail.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target.join(" ")}) ${v.nodes[0]?.html ?? ""}`),
      ).toEqual([]);

      // An exhibition's detail page (team + performance).
      await page.goto("/events");
      await page.getByRole("link", { name: /Spice Expo Live/ }).first().click();
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      const show = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        show.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target.join(" ")}) ${v.nodes[0]?.html ?? ""}`),
      ).toEqual([]);

      expect(problems).toEqual([]);
    });
  });
}
