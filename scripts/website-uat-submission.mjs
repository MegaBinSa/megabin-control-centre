import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const CONFIG_PATH = new URL("../config/synthetic-uat-website-intake.json", import.meta.url);
const MODES = new Set(["initial_submission", "idempotency_retry"]);

export async function readWebsiteUatConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

export function validateWebsiteUatPlan(config, values) {
  const errors = [];
  const expectedUrl = `https://${config.projectRef}.supabase.co`;
  const expectedEndpoint = `${expectedUrl}/functions/v1/website-onboarding`;
  const expectedConfirmation = `SUBMIT-UAT-WEB-001:${config.projectRef}:${config.sourceSubmissionId}:${values.sourceSha}:${values.mode}`;

  if (config.caseId !== "UAT-WEB-001") errors.push("Unexpected UAT case ID.");
  if (config.environment !== "staging" || values.environment !== "staging")
    errors.push("The submission is restricted to Staging.");
  if (!/^[a-z]{20}$/.test(config.projectRef)) errors.push("Invalid approved project reference.");
  if (config.projectRef !== "xniweqdmswzljcgkfglx")
    errors.push("The repository-approved Shared Staging project is required.");
  if (/prod(uction)?/i.test(config.projectRef) || /prod(uction)?/i.test(values.supabaseUrl ?? ""))
    errors.push("Production references are forbidden.");
  if (values.projectRef !== config.projectRef)
    errors.push("Environment project reference mismatch.");
  if (values.supabaseUrl !== expectedUrl) errors.push("Environment Supabase URL mismatch.");
  if (values.onboardingUrl !== expectedEndpoint)
    errors.push("Website Onboarding endpoint mismatch.");
  if (values.integrationKey !== config.integrationKey)
    errors.push("Synthetic Staging integration identity mismatch.");
  if (!values.integrationSecret) errors.push("Protected integration secret is required.");
  if (values.sourceSubmissionId !== config.sourceSubmissionId)
    errors.push("Only the reserved source submission identity is allowed.");
  if (config.payload?.sourceSubmissionId !== config.sourceSubmissionId)
    errors.push("Payload and reserved source identity differ.");
  if (!MODES.has(values.mode)) errors.push("Unsupported execution mode.");
  if (!/^[0-9a-f]{40}$/.test(values.sourceSha ?? "")) errors.push("A full source SHA is required.");
  if (values.confirmation !== expectedConfirmation)
    errors.push("Deterministic submission confirmation does not match.");

  return { ok: errors.length === 0, errors, expectedConfirmation };
}

export async function submitWebsiteUat(values, fetchImpl = fetch) {
  const config = await readWebsiteUatConfig();
  const validation = validateWebsiteUatPlan(config, values);
  if (!validation.ok) throw new Error(validation.errors.join(" "));

  const body = JSON.stringify(config.payload);
  const payloadSha256 = createHash("sha256").update(body).digest("hex");
  const correlationId = randomUUID();
  const requestedAt = new Date().toISOString();
  const response = await fetchImpl(
    `${values.onboardingUrl}/api/v1/integrations/website/onboarding`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Integration-Key": values.integrationKey,
        "X-Integration-Secret": values.integrationSecret,
        "Idempotency-Key": config.sourceSubmissionId,
        "X-Correlation-Id": correlationId
      },
      body
    }
  );
  const responseBody = await response.json().catch(() => null);
  const expectedStatus = values.mode === "initial_submission" ? 202 : 200;
  const duplicate = responseBody?.data?.duplicate;
  const passed =
    response.status === expectedStatus &&
    responseBody?.ok === true &&
    (values.mode === "initial_submission" ? duplicate === false : duplicate === true);
  const evidence = {
    schemaVersion: 1,
    caseId: config.caseId,
    environment: config.environment,
    projectRef: config.projectRef,
    sourceSha: values.sourceSha,
    workflowRunId: values.workflowRunId,
    workflowRunAttempt: values.workflowRunAttempt,
    operator: values.operator,
    executionMode: values.mode,
    sourceSubmissionId: config.sourceSubmissionId,
    idempotencyKey: config.sourceSubmissionId,
    payloadSha256,
    correlationId,
    requestedAt,
    completedAt: new Date().toISOString(),
    httpStatus: response.status,
    expectedStatus,
    duplicate: typeof duplicate === "boolean" ? duplicate : null,
    submissionId:
      typeof responseBody?.data?.submissionId === "string" ? responseBody.data.submissionId : null,
    result: passed ? "Passed" : "Failed"
  };
  await writeFile(values.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600
  });
  if (!passed)
    throw new Error(
      `UAT Website Intake submission failed safely (HTTP ${response.status}, correlation ${correlationId}).`
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

if (process.argv[1]?.endsWith("website-uat-submission.mjs")) {
  const args = argumentsFrom(process.argv.slice(2));
  const evidence = await submitWebsiteUat({
    environment: process.env.MEGABIN_ENVIRONMENT,
    projectRef: process.env.SUPABASE_PROJECT_REF,
    supabaseUrl: process.env.SUPABASE_URL,
    onboardingUrl: process.env.MEGABIN_WEBSITE_ONBOARDING_URL,
    integrationKey: process.env.MEGABIN_WEBSITE_ONBOARDING_INTEGRATION_KEY,
    integrationSecret: process.env.MEGABIN_WEBSITE_ONBOARDING_SECRET,
    sourceSha: args["source-sha"],
    sourceSubmissionId: args["source-submission-id"],
    mode: args.mode,
    confirmation: args.confirmation,
    evidencePath: args.evidence,
    workflowRunId: process.env.GITHUB_RUN_ID ?? "local",
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "0",
    operator: process.env.GITHUB_ACTOR ?? "local"
  });
  console.log(
    `PASS: ${evidence.caseId} ${evidence.executionMode} HTTP ${evidence.httpStatus}; safe evidence written.`
  );
}
