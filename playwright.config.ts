import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm --filter @megabin/office-web dev --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: "http://supabase.phase1b.test",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      VITE_MASTER_DATA_API_URL: "http://api.phase1b.test"
    }
  }
});
