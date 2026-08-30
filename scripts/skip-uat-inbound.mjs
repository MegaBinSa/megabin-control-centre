import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../config/synthetic-uat-skip-inbound.json", import.meta.url);

export async function readSkipUatConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

export function validateSkipUatPlan(config, values) {
  const errors = [];
  const expectedUrl = `https://${config.projectRef}.supabase.co`;
  const expectedRuntimeUrl = `${expectedUrl}/functions/v1/platform-runtime`;
  const expectedConfirmation = `SUBMIT-UAT-SKP-001:${config.projectRef}:${config.providerMessageId}:${values.sourceSha}`;

  if (config.caseId !== "UAT-SKP-001") errors.push("Unexpected UAT case ID.");
  if (config.environment !== "staging" || values.environment !== "staging")
    errors.push("The inbound submission is restricted to Staging.");
  if (config.projectRef !== "xniweqdmswzljcgkfglx")
    errors.push("The repository-approved Shared Staging project is required.");
  if (values.projectRef !== config.projectRef)
    errors.push("Environment project reference mismatch.");
  if (values.supabaseUrl !== expectedUrl) errors.push("Environment Supabase URL mismatch.");
  if (values.runtimeUrl !== expectedRuntimeUrl) errors.push("Platform Runtime endpoint mismatch.");
  if (/prod(uction)?/i.test(`${values.projectRef ?? ""} ${values.supabaseUrl ?? ""}`))
    errors.push("Production references are forbidden.");
  if (!values.publishableKey) errors.push("Protected Supabase publishable key is required.");
  if (!values.officeEmail || !values.officePassword)
    errors.push("Protected synthetic Office credentials are required.");
  if (!values.webhookSecret) errors.push("Protected communications webhook secret is required.");
  if (values.providerMessageId !== config.providerMessageId)
    errors.push("Only the reserved provider message identity is allowed.");
  if (config.payload?.providerMessageId !== config.providerMessageId)
    errors.push("Payload and reserved provider message identity differ.");
  if (config.payload?.text?.trim().toLowerCase() !== "skip")
    errors.push("The repository payload must contain only the SKIP command.");
  if (!/^[0-9a-f]{40}$/.test(values.sourceSha ?? "")) errors.push("A full source SHA is required.");
  if (values.confirmation !== expectedConfirmation)
    errors.push("Deterministic inbound confirmation does not match.");

  return { ok: errors.length === 0, errors, expectedConfirmation };
}

async function authenticateOffice(values, fetchImpl) {
  const response = await fetchImpl(`${values.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: values.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: values.officeEmail, password: values.officePassword })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.access_token !== "string")
    throw new Error(`Synthetic Office authentication failed safely (HTTP ${response.status}).`);
  return body.access_token;
}

export async function submitSkipUatInbound(values, fetchImpl = fetch) {
  const config = await readSkipUatConfig();
  const validation = validateSkipUatPlan(config, values);
  if (!validation.ok) throw new Error(validation.errors.join(" "));

  const token = await authenticateOffice(values, fetchImpl);
  const requestBody = JSON.stringify(config.payload);
  const payloadSha256 = createHash("sha256").update(requestBody).digest("hex");
  const correlationId = randomUUID();
  const requestedAt = new Date().toISOString();
  const response = await fetchImpl(
    `${values.runtimeUrl}/api/v1/integrations/communications/inbound`,
    {
      method: "POST",
      headers: {
        apikey: values.publishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Communications-Webhook-Secret": values.webhookSecret,
        "X-Correlation-Id": correlationId
      },
      body: requestBody
    }
  );
  const responseBody = await response.json().catch(() => null);
  const data = responseBody?.data;
  const skip = data?.clientSkip;
  const passed =
    response.status === 200 &&
    responseBody?.ok === true &&
    data?.recognizedCommand === config.expected.recognizedCommand &&
    skip?.matchState === config.expected.matchState &&
    skip?.lifecycleStatus === config.expected.lifecycleStatus &&
    skip?.serviceRegionId === config.expected.serviceRegionId &&
    skip?.clientServiceId === config.expected.clientServiceId &&
    typeof skip?.collectionOccurrenceId === "string";
  const evidence = {
    schemaVersion: 1,
    caseId: config.caseId,
    environment: config.environment,
    projectRef: config.projectRef,
    sourceSha: values.sourceSha,
    workflowRunId: values.workflowRunId,
    workflowRunAttempt: values.workflowRunAttempt,
    operator: values.operator,
    providerMessageId: config.providerMessageId,
    payloadSha256,
    correlationId,
    requestedAt,
    completedAt: new Date().toISOString(),
    httpStatus: response.status,
    duplicate: typeof data?.duplicate === "boolean" ? data.duplicate : null,
    inboundMessageId: typeof data?.inboundMessageId === "string" ? data.inboundMessageId : null,
    skipRequestId: typeof skip?.clientSkipRequestId === "string" ? skip.clientSkipRequestId : null,
    collectionOccurrenceId:
      typeof skip?.collectionOccurrenceId === "string" ? skip.collectionOccurrenceId : null,
    expectedCollectionDate: config.expected.collectionDate,
    matchState: typeof skip?.matchState === "string" ? skip.matchState : null,
    lifecycleStatus: typeof skip?.lifecycleStatus === "string" ? skip.lifecycleStatus : null,
    cutoffStatus: typeof skip?.cutoffStatus === "string" ? skip.cutoffStatus : null,
    result: passed ? "Passed" : "Failed"
  };
  await writeFile(values.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  if (!passed)
    throw new Error(
      `UAT SKIP inbound submission failed safely (HTTP ${response.status}, correlation ${correlationId}).`
    );
  return evidence;
}

function argumentsFrom(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("Invalid CLI arguments.");
    values[key.slice(2)] = value;
  }
  return values;
}

if (process.argv[1]?.endsWith("skip-uat-inbound.mjs")) {
  const args = argumentsFrom(process.argv.slice(2));
  const evidence = await submitSkipUatInbound({
    environment: process.env.MEGABIN_ENVIRONMENT,
    projectRef: process.env.SUPABASE_PROJECT_REF,
    supabaseUrl: process.env.SUPABASE_URL,
    runtimeUrl: process.env.MEGABIN_PLATFORM_RUNTIME_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    officeEmail: process.env.STAGING_OFFICE_EMAIL,
    officePassword: process.env.STAGING_OFFICE_PASSWORD,
    webhookSecret: process.env.MEGABIN_COMMUNICATIONS_WEBHOOK_SECRET,
    sourceSha: args["source-sha"],
    providerMessageId: args["provider-message-id"],
    confirmation: args.confirmation,
    evidencePath: args.evidence,
    workflowRunId: process.env.GITHUB_RUN_ID ?? "local",
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "0",
    operator: process.env.GITHUB_ACTOR ?? "local"
  });
  console.log(
    `PASS: ${evidence.caseId} inbound HTTP ${evidence.httpStatus}; safe evidence written.`
  );
}
