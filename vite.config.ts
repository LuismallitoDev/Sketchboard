import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Never inline assets as data: URIs, so the production CSP can keep font-src 'self'.
  build: { assetsInlineLimit: 0 },
  server: { port: 5200, strictPort: true },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
