import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3108);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/performance",
  timeout: 120_000,
  retries: 0,
  outputDir: "test-results/performance",
  use: { ...devices["Desktop Chrome"], baseURL, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, trace: "retain-on-failure" },
  webServer: { command: `npm run start -- --port ${port}`, url: baseURL, reuseExistingServer: false },
  projects: [{ name: "chromium-performance", use: { browserName: "chromium" } }],
});
