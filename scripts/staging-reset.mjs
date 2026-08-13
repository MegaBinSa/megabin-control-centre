import { spawnSync } from "node:child_process";

export function assertStagingReset(values) {
  if (values.MEGABIN_ENVIRONMENT !== "staging") throw new Error("Reset target must be staging.");
  const ref = values.SUPABASE_PROJECT_REF ?? "";
  if (!/^[a-z0-9]{20}$/.test(ref))
    throw new Error("A valid staging project reference is required.");
  if (values.CONFIRM_STAGING_RESET !== `RESET-STAGING:${ref}`)
    throw new Error("Explicit project-bound reset confirmation is required.");
  if (values.PRODUCTION_SUPABASE_PROJECT_REF && values.PRODUCTION_SUPABASE_PROJECT_REF === ref)
    throw new Error("Staging reset target matches the recorded production project.");
  return ref;
}

if (process.argv[1]?.endsWith("staging-reset.mjs")) {
  const ref = assertStagingReset(process.env);
  if (!process.argv.includes("--execute")) {
    console.log(`Staging reset guard passed for ${ref}; no destructive action executed.`);
    process.exit(0);
  }
  const result = spawnSync("supabase", ["db", "reset", "--linked"], {
    stdio: "inherit",
    shell: true
  });
  process.exit(result.status ?? 1);
}
