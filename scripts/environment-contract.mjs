const ENVIRONMENTS = new Set(["local", "staging", "production"]);

const required = [
  "MEGABIN_ENVIRONMENT",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_MASTER_DATA_API_URL",
  "VITE_DRIVER_API_URL",
  "VITE_MEGABIN_ENVIRONMENT",
  "VITE_BUILD_SHA",
  "VITE_BUILD_TIMESTAMP",
  "VITE_DEPLOYMENT_ID",
  "MEGABIN_OFFICE_ORIGIN",
  "MEGABIN_DRIVER_ORIGIN",
  "MEGABIN_ALLOWED_ORIGINS",
  "MEGABIN_WEBSITE_ONBOARDING_INTEGRATION_KEY",
  "MEGABIN_WEBSITE_ONBOARDING_SECRET",
  "MEGABIN_WEBSITE_ONBOARDING_URL",
  "MEGABIN_COMMUNICATIONS_MODE",
  "MEGABIN_COMMUNICATIONS_WEBHOOK_SECRET",
  "MEGABIN_ROUTING_PROVIDER",
  "MEGABIN_OPTIMIZATION_PROVIDER",
  "MEGABIN_ACCOUNTING_PROVIDER",
  "MEGABIN_AUTO_FINANCIAL_HOLD",
  "MEGABIN_AUTO_FINANCIAL_RELEASE",
  "MEGABIN_AUTO_SKIP_REPLAN"
];

const deploymentRequired = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "STAGING_OFFICE_EMAIL",
  "STAGING_OFFICE_PASSWORD",
  "STAGING_DRIVER_EMAIL",
  "STAGING_DRIVER_PASSWORD"
];
const secretNames = new Set([
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "MEGABIN_WEBSITE_ONBOARDING_SECRET",
  "MEGABIN_COMMUNICATIONS_WEBHOOK_SECRET",
  "STAGING_OFFICE_PASSWORD",
  "STAGING_DRIVER_PASSWORD"
]);

function validHttps(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateEnvironment(target, values, options = {}) {
  const errors = [];
  if (!ENVIRONMENTS.has(target)) errors.push(`Unknown environment ${target}.`);
  if (values.MEGABIN_ENVIRONMENT !== target)
    errors.push("MEGABIN_ENVIRONMENT must exactly match the requested target.");
  if (values.VITE_MEGABIN_ENVIRONMENT !== target)
    errors.push("VITE_MEGABIN_ENVIRONMENT must exactly match the requested target.");

  for (const key of [...required, ...(options.deployment ? deploymentRequired : [])]) {
    if (!values[key] || String(values[key]).trim() === "") errors.push(`${key} is required.`);
  }

  const projectRef = values.SUPABASE_PROJECT_REF ?? "";
  if (!/^[a-z0-9]{20}$/.test(projectRef))
    errors.push("SUPABASE_PROJECT_REF must be the 20-character hosted project reference.");
  for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    if (values[key] && !validHttps(values[key])) errors.push(`${key} must use HTTPS.`);
    if (values[key] && projectRef && !String(values[key]).includes(`${projectRef}.supabase.co`))
      errors.push(`${key} does not match SUPABASE_PROJECT_REF.`);
  }
  for (const key of [
    "VITE_MASTER_DATA_API_URL",
    "VITE_DRIVER_API_URL",
    "MEGABIN_WEBSITE_ONBOARDING_URL",
    "MEGABIN_OFFICE_ORIGIN",
    "MEGABIN_DRIVER_ORIGIN"
  ]) {
    if (values[key] && !validHttps(values[key])) errors.push(`${key} must use HTTPS.`);
  }
  for (const key of ["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"])
    if (/service[_-]?role|sb_secret_/i.test(String(values[key] ?? "")))
      errors.push(`${key} appears to contain a privileged secret key.`);
  if (
    values.MEGABIN_OFFICE_ORIGIN &&
    values.MEGABIN_DRIVER_ORIGIN &&
    values.MEGABIN_OFFICE_ORIGIN === values.MEGABIN_DRIVER_ORIGIN
  )
    errors.push("Office and Driver origins must be isolated URLs.");
  const origins = String(values.MEGABIN_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.includes("*")) errors.push("Wildcard authenticated API CORS is forbidden.");
  for (const key of ["MEGABIN_OFFICE_ORIGIN", "MEGABIN_DRIVER_ORIGIN"])
    if (values[key] && !origins.includes(values[key]))
      errors.push(`${key} must be present in MEGABIN_ALLOWED_ORIGINS.`);

  if (target === "staging") {
    if (values.MEGABIN_COMMUNICATIONS_MODE === "live")
      errors.push("Staging communications cannot use live mode.");
    if (!new Set(["capture", "test"]).has(values.MEGABIN_COMMUNICATIONS_MODE))
      errors.push("Staging communications must use capture or test mode.");
    if (
      values.MEGABIN_COMMUNICATIONS_MODE === "test" &&
      !String(values.MEGABIN_COMMUNICATIONS_TEST_RECIPIENTS ?? "").trim()
    )
      errors.push("Staging test mode requires an explicit test-recipient allowlist.");
    if (values.MEGABIN_ROUTING_PROVIDER !== "fake-routing")
      errors.push("Staging routing must remain fake-routing in Phase 5B.");
    if (values.MEGABIN_OPTIMIZATION_PROVIDER !== "fake-optimizer")
      errors.push("Staging optimization must remain fake-optimizer in Phase 5B.");
    if (values.MEGABIN_ACCOUNTING_PROVIDER !== "zoho-books-fake")
      errors.push("Staging accounting must remain zoho-books-fake in Phase 5B.");
  }
  for (const key of [
    "MEGABIN_AUTO_FINANCIAL_HOLD",
    "MEGABIN_AUTO_FINANCIAL_RELEASE",
    "MEGABIN_AUTO_SKIP_REPLAN"
  ])
    if (values[key] !== "false") errors.push(`${key} must remain false.`);

  if (target === "production" && options.deployment)
    errors.push("Production deployment is disabled in Phase 5B.");
  return { ok: errors.length === 0, errors };
}

export function configurationReport(target, values, options = {}) {
  return [...required, ...(options.deployment ? deploymentRequired : [])].sort().map((key) => ({
    key,
    classification: secretNames.has(key) ? "secret" : "configuration",
    status: values[key] ? "configured" : "missing",
    environment: target
  }));
}
