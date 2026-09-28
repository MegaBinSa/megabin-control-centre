import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../config/synthetic-uat-accounting-sync.json", import.meta.url);
const MODES = new Set(["initial_sync", "idempotency_retry"]);
const TERMINAL = new Set(["succeeded", "partial", "failed", "cancelled"]);

export async function readAccountingUatConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

export function validateAccountingUatPlan(config, values) {
  const errors = [];
  const expectedUrl = `https://${config.projectRef}.supabase.co`;
  const expectedRuntime = `${expectedUrl}/functions/v1/platform-runtime`;
  const expectedConfirmation = `SYNC-UAT-FIN-001:${config.projectRef}:${config.syncIdentity}:${values.sourceSha}:${values.mode}`;
  if (config.caseId !== "UAT-FIN-001") errors.push("Unexpected UAT case ID.");
  if (config.environment !== "staging" || values.environment !== "staging")
    errors.push("The synchronization is restricted to Staging.");
  if (config.projectRef !== "xniweqdmswzljcgkfglx" || values.projectRef !== config.projectRef)
    errors.push("The repository-approved Shared Staging project is required.");
  if (values.supabaseUrl !== expectedUrl || values.runtimeUrl !== expectedRuntime)
    errors.push("Shared Staging URL binding is invalid.");
  if (/prod(uction)?/i.test(`${values.projectRef} ${values.supabaseUrl} ${values.runtimeUrl}`))
    errors.push("Production references are forbidden.");
  if (config.provider !== "zoho-books-fake" || values.provider !== config.provider)
    errors.push("The deterministic fake accounting provider is required.");
  if (values.operatorEmail !== config.operatorEmail)
    errors.push("The approved synthetic accounting operator is required.");
  if (!MODES.has(values.mode)) errors.push("Unexpected execution mode.");
  if (values.confirmation !== expectedConfirmation)
    errors.push("The deterministic synchronization confirmation is invalid.");
  for (const [name, value] of Object.entries({
    publishableKey: values.publishableKey,
    operatorPassword: values.operatorPassword,
    sourceSha: values.sourceSha,
    evidencePath: values.evidencePath
  }))
    if (!String(value ?? "").trim()) errors.push(`${name} is required.`);
  return { ok: errors.length === 0, errors, expectedConfirmation };
}

async function responseJson(response) {
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object") throw new Error("Unexpected non-JSON response.");
  return body;
}

export async function submitAccountingUatSync(
  values,
  fetcher = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
) {
  const config = await readAccountingUatConfig();
  const validation = validateAccountingUatPlan(config, values);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));

  const authResponse = await fetcher(`${values.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: values.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: values.operatorEmail, password: values.operatorPassword })
  });
  const authBody = await responseJson(authResponse);
  const accessToken = authBody.access_token;
  if (!authResponse.ok || typeof accessToken !== "string")
    throw new Error("Synthetic accounting operator authentication failed.");

  const authenticatedHeaders = {
    apikey: values.publishableKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
  const profileResponse = await fetcher(`${values.runtimeUrl}/api/v1/office/profile`, {
    headers: authenticatedHeaders
  });
  const profileBody = await responseJson(profileResponse);
  const profile = profileBody.data ?? {};
  if (
    !profileResponse.ok ||
    profile.displayName !== config.operatorDisplayName ||
    profile.globalAccess !== true ||
    !Array.isArray(profile.roles) ||
    !profile.roles.includes(config.operatorRole) ||
    !Array.isArray(profile.permissions) ||
    !profile.permissions.includes("accounting.sync")
  )
    throw new Error("Synthetic accounting operator authority is not the approved global contract.");

  const correlationId = randomUUID();
  const syncResponse = await fetcher(`${values.runtimeUrl}/api/v1/accounting/sync-runs`, {
    method: "POST",
    headers: {
      ...authenticatedHeaders,
      "Idempotency-Key": config.syncIdentity,
      "X-Correlation-Id": correlationId
    },
    body: JSON.stringify({ syncMode: config.syncMode })
  });
  const syncBody = await responseJson(syncResponse);
  const syncData = syncBody.data ?? {};
  const expectedHttp = values.mode === "initial_sync" ? 202 : 200;
  const expectedDuplicate = values.mode === "idempotency_retry";
  if (
    syncResponse.status !== expectedHttp ||
    syncBody.ok !== true ||
    syncData.duplicate !== expectedDuplicate ||
    typeof syncData.syncRunId !== "string"
  )
    throw new Error(
      `Accounting synchronization was rejected safely (HTTP ${syncResponse.status}).`
    );

  let run = syncData;
  for (let attempt = 0; attempt < 30 && !TERMINAL.has(run.status); attempt++) {
    await wait(2000);
    const runsResponse = await fetcher(`${values.runtimeUrl}/api/v1/accounting/sync-runs`, {
      headers: authenticatedHeaders
    });
    const runsBody = await responseJson(runsResponse);
    if (!runsResponse.ok || runsBody.ok !== true)
      throw new Error("Accounting synchronization status could not be verified.");
    run = (runsBody.data?.items ?? []).find((item) => item.syncRunId === syncData.syncRunId) ?? run;
  }

  const passed = run.status === "succeeded";
  const evidence = {
    caseId: config.caseId,
    result: passed ? "Passed" : "Failed",
    environment: config.environment,
    projectRef: config.projectRef,
    sourceSha: values.sourceSha,
    executionMode: values.mode,
    syncIdentity: config.syncIdentity,
    provider: config.provider,
    syncMode: config.syncMode,
    workflowRunId: values.workflowRunId,
    workflowRunAttempt: values.workflowRunAttempt,
    operator: values.operator,
    httpStatus: syncResponse.status,
    duplicate: syncData.duplicate,
    syncRunId: syncData.syncRunId,
    lifecycleStatus: run.status,
    fetchedCounts: run.fetchedCounts ?? {},
    failureClassification: run.failureClassification ?? null,
    correlationId,
    verifiedAt: new Date().toISOString(),
    safeguards: {
      fakeProviderOnly: true,
      noDirectDatabaseWrite: true,
      noFinancialDecision: true,
      noRouteMutation: true
    }
  };
  await writeFile(values.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  if (!passed) throw new Error(`Accounting synchronization ended in ${String(run.status)}.`);
  return evidence;
}

function argumentsFrom(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index],
      value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("Invalid CLI arguments.");
    values[key.slice(2)] = value;
  }
  return values;
}

if (process.argv[1]?.endsWith("accounting-uat-sync.mjs")) {
  const args = argumentsFrom(process.argv.slice(2));
  const evidence = await submitAccountingUatSync({
    environment: process.env.MEGABIN_ENVIRONMENT,
    projectRef: process.env.SUPABASE_PROJECT_REF,
    supabaseUrl: process.env.SUPABASE_URL,
    runtimeUrl: process.env.MEGABIN_PLATFORM_RUNTIME_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    provider: process.env.MEGABIN_ACCOUNTING_PROVIDER,
    operatorEmail: process.env.STAGING_ACCOUNTING_EMAIL,
    operatorPassword: process.env.STAGING_ACCOUNTING_PASSWORD,
    sourceSha: args["source-sha"],
    mode: args.mode,
    confirmation: args.confirmation,
    evidencePath: args.evidence,
    workflowRunId: process.env.GITHUB_RUN_ID ?? "local",
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "0",
    operator: process.env.GITHUB_ACTOR ?? "local"
  });
  console.log(`PASS: ${evidence.caseId} ${evidence.executionMode}; sanitized evidence written.`);
}
