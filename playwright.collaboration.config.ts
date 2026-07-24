import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_COLLABORATION_PORT ?? 3110);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/collaboration",
  retries: 0,
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: [
    { command: "npm run collaboration:dev", url: "http://127.0.0.1:8787/health", reuseExistingServer: !process.env.CI },
    {
      command: `npm run build && npm run start -- --port ${port}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 180_000,
      // NEXT_PUBLIC_* flags are inlined at build time, so the flag must be set for the build, not just the server.
      env: { NEXT_PUBLIC_COLLABORATION_ENABLED: "1" },
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
