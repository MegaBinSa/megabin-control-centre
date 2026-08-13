import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure" },
  webServer: [
    {
      command:
        "node apps/office-web/node_modules/vite/bin/vite.js apps/office-web --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: "http://supabase.phase1b.test",
        VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
        VITE_MASTER_DATA_API_URL: "http://api.phase1b.test"
      }
    },
    {
      command:
        "node apps/driver-pwa/node_modules/vite/bin/vite.js apps/driver-pwa --host 127.0.0.1 --port 4175",
      url: "http://127.0.0.1:4175",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: "http://supabase.phase3a.test",
        VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
        VITE_DRIVER_API_URL: "http://api.phase3a.test"
      }
    }
  ]
});
