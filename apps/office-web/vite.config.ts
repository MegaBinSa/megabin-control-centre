import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (["staging", "production"].includes(env.VITE_MEGABIN_ENVIRONMENT ?? "")) {
    for (const key of [
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_MASTER_DATA_API_URL",
      "VITE_BUILD_SHA",
      "VITE_BUILD_TIMESTAMP",
      "VITE_DEPLOYMENT_ID"
    ])
      if (!env[key]) throw new Error(`${key} is required for a deployable Office build.`);
  }
  return { build: { sourcemap: false } };
});
