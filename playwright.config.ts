import { defineConfig } from "@playwright/test";

const PORT = 5201;

export default defineConfig({
  testDir: "e2e",
  // One worker: this laptop has ~7.6 GB of RAM and a full Chrome per worker is heavy.
  workers: Number(process.env.PW_WORKERS) || 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    // Uses the installed Chrome; run `npx playwright install chromium` and drop this to use the bundled one.
    channel: "chrome",
    baseURL: `http://localhost:${PORT}`,
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 },
  },
  // Fresh server every run (never reuse one). VITE_E2E exposes window.__sketchboard for assertions.
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    env: { VITE_E2E: "1" },
  },
});
