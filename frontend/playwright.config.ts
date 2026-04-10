import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:7777",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm exec vite --port 7777 --host 127.0.0.1",
    url: "http://127.0.0.1:7777",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
