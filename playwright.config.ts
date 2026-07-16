import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3107", trace: "retain-on-failure" },
  webServer: { command: "npm run start -- --port 3107", url: "http://127.0.0.1:3107", reuseExistingServer: false },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
