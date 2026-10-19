import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3100;
const API_PORT = 4010;

/**
 * E2E runs the production build against an in-memory mock of the Leadflow API (e2e/mock-api).
 * Mock access tokens live 62 s — just over the frontend's 60 s refresh window — so the token
 * rotation path is exercised continuously, and the suite finishes by asserting that no refresh
 * token was ever replayed.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // the mock API holds shared in-memory state
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        // A fake microphone/camera so recording can be tested without hardware or a permission prompt.
        permissions: ["microphone", "camera"],
        launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
      },
      testIgnore: /mobile.spec.ts/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "node e2e/mock-api/server.mjs",
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: { MOCK_PORT: String(API_PORT), MOCK_EXPIRES_IN: "62" },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node scripts/serve-standalone.mjs",
      url: `http://127.0.0.1:${APP_PORT}/api/health`,
      env: {
        PORT: String(APP_PORT),
        HOSTNAME: "127.0.0.1",
        API_URL: `http://127.0.0.1:${API_PORT}`,
        SESSION_SECRET: "e2e-only-secret-e2e-only-secret-e2e-only",
        SESSION_COOKIE_SECURE: "false",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
