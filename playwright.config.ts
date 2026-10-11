import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    channel: "chrome",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  reporter: "list",
});
