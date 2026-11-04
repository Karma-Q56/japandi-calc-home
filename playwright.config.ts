import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env["PLAYWRIGHT_BASE_URL"];
const baseURL = externalBaseURL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(externalBaseURL
    ? {}
    : {
        webServer: {
        command:
          "node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5173 --strictPort",
        // Wait for a server-rendered page, not the static root shell. Otherwise the
        // first test pays for the worker cold start and can exceed its own timeout.
        url: "http://127.0.0.1:5173/demo/status",
        reuseExistingServer: !process.env["CI"],
        timeout: 120_000,
        },
      }),
});
