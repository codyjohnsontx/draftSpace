import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3107);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // WebGL-heavy specs (landing, 3D space) render on the CPU under GPU-less CI; running two at once
  // starves timeouts, so serialize on CI and let a genuine hiccup retry once.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  timeout: process.env.CI ? 60_000 : 30_000,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: { command: `npm run start -- --port ${port}`, url: baseURL, reuseExistingServer: false },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
