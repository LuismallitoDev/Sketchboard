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
  // The tests run against a production build served by `vite preview`: the dev server's module graph is heavy
  // enough to run out of memory on a small laptop halfway through a long suite, the preview server is tiny.
  webServer: {
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_E2E: "1" },
  },
});
