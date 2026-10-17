import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

// Fixed non-production destinations and identities; dispatch cannot supply URLs,
// credentials, SQL, action bodies, or an operational mutation switch.
const supabase = "https://xniweqdmswzljcgkfglx.supabase.co";
const runtime = `${supabase}/functions/v1/platform-runtime/api/v1`;
const officeOrigin = "https://megabin-office-staging.pages.dev";
const driverOrigin = "https://megabin-driver-staging.pages.dev";
const region = "51000000-0000-0000-0000-000000000001";
const output = ".cache/financial-hosted-uat";
const evidence = {
  caseId: "UAT-FIN-001",
  environment: "staging",
  expectedBuildSha: process.env.EXPECTED_BUILD_SHA,
  verificationCommit: process.env.GITHUB_SHA,
  workflowRunId: process.env.GITHUB_RUN_ID,
  startedAt: new Date().toISOString(),
  checks: [],
  outcome: "Failed"
};

async function check(name, operation) {
  try {
    const detail = await operation();
    evidence.checks.push({ name, passed: true, ...detail });
    console.log(`PASS ${name}`);
  } catch {
    // Assertion/fetch/browser exceptions can include response data or credentials.
    // Retain the failing check identity, never the raw exception or response body.
    evidence.checks.push({ name, passed: false });
    throw new Error(`Hosted UAT check failed: ${name}`);
  }
}

async function signIn(email, password, expectedUserId) {
  assert(password && process.env.SUPABASE_PUBLISHABLE_KEY);
  const response = await fetch(`${supabase}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal(session.user?.id, expectedUserId);
  assert.equal(session.user?.email, email);
  assert(session.access_token);
  return session.access_token;
}

async function get(path, token) {
  const correlationId = crypto.randomUUID();
  const response = await fetch(`${runtime}${path}`, {
    redirect: "error",
    headers: { Authorization: `Bearer ${token}`, "X-Correlation-Id": correlationId }
  });
  return { status: response.status, body: await response.json(), correlationId };
}

function deny(result) {
  assert.equal(result.status, 403);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.data, undefined);
  assert.equal(result.body.items, undefined);
  assert(result.body.error?.code);
  return {
    status: result.status,
    code: result.body.error.code,
    correlationId: result.correlationId
  };
}

let browser;
try {
  await mkdir(output, { recursive: true });
  await check("fixed_release_input", async () => {
    assert.match(process.env.EXPECTED_BUILD_SHA ?? "", /^[a-f0-9]{40}$/);
  });
  let officeToken, driverToken;
  await check("verified_office_identity", async () => {
    officeToken = await signIn(
      "staging-office@megabin.local",
      process.env.STAGING_OFFICE_PASSWORD,
      "0c1eb73f-c8f8-42d2-8a8a-faabab7bead7"
    );
    return { userId: "0c1eb73f-c8f8-42d2-8a8a-faabab7bead7" };
  });
  await check("verified_driver_identity", async () => {
    driverToken = await signIn(
      "staging-driver@megabin.local",
      process.env.STAGING_DRIVER_PASSWORD,
      "aaa27c4a-040c-40d0-83d1-6a70d446c994"
    );
    return { userId: "aaa27c4a-040c-40d0-83d1-6a70d446c994" };
  });
  await check("deployed_runtime_identity", async () => {
    const result = await get("/health/live", officeToken);
    assert.equal(result.status, 200);
    assert.equal(result.body.runtime?.buildId, process.env.EXPECTED_BUILD_SHA);
    assert.equal(result.body.runtime?.environment, "staging");
    evidence.deploymentId = result.body.runtime.deploymentId;
    return { status: result.status, buildSha: result.body.runtime.buildId };
  });
  await check("office_region_and_permission", async () => {
    const result = await get("/office/profile", officeToken);
    assert.equal(result.status, 200);
    assert(result.body.data.permissions.includes("financial_eligibility.read"));
    assert.equal(result.body.data.globalAccess, false);
    assert.deepEqual(result.body.data.serviceRegionIds, [region]);
    return { status: result.status, serviceRegionIds: [region], globalAccess: false };
  });
  for (const [name, path, allowedRegions] of [
    ["office_financial_list", "/financial-eligibility/decisions", [region]],
    [
      "office_financial_region",
      `/financial-eligibility/decisions?serviceRegionId=${region}`,
      [region]
    ],
    [
      "office_financial_other_region",
      "/financial-eligibility/decisions?serviceRegionId=51000000-0000-0000-0000-000000000002",
      []
    ]
  ]) {
    await check(name, async () => {
      const result = await get(path, officeToken);
      assert.equal(result.status, 200);
      assert.equal(result.body.ok, true);
      assert(Array.isArray(result.body.data.items));
      assert(result.body.data.items.every((item) => allowedRegions.includes(item.serviceRegionId)));
      return {
        status: result.status,
        itemCount: result.body.data.items.length,
        correlationId: result.correlationId
      };
    });
  }
  await check("office_accounting_projection", async () => {
    const result = await get(`/accounting/status?serviceRegionId=${region}`, officeToken);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    return { status: result.status, correlationId: result.correlationId };
  });
  for (const [name, path] of [
    ["driver_financial_denial", "/financial-eligibility/decisions"],
    ["driver_accounting_denial", "/accounting/status"]
  ])
    await check(name, async () => deny(await get(path, driverToken)));

  await check("driver_profile_has_no_financial_permission", async () => {
    // The profile endpoint returns the actor's own identity; Office applies its
    // workspace gate to these permissions rather than denying profile access.
    const result = await get("/office/profile", driverToken);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.userId, "aaa27c4a-040c-40d0-83d1-6a70d446c994");
    assert(!result.body.data.permissions.includes("financial_eligibility.read"));
    assert(!result.body.data.permissions.includes("master_data.read"));
    return { status: result.status, financialRead: false, masterDataRead: false };
  });

  await check("driver_current_operation_precondition", async () => {
    const result = await get("/driver/route-operations", driverToken);
    assert.equal(result.status, 200);
    const items = Array.isArray(result.body.data) ? result.body.data : result.body.data.items;
    assert(Array.isArray(items));
    const manifests = [];
    for (const item of items) {
      const detail = await get(
        `/driver/route-operations/${item.routeOperationId}/manifest`,
        driverToken
      );
      assert.equal(detail.status, 200);
      manifests.push({
        routeOperationId: item.routeOperationId,
        routeDate: detail.body.data.routeDate,
        lifecycleStatus: detail.body.data.lifecycleStatus,
        startEligibility: detail.body.data.startEligibility
      });
    }
    evidence.driverLiveTransition = {
      result: "Not Run",
      reason: "Read-only verifier never accepts or starts operations.",
      assignedOperations: manifests
    };
    return { status: result.status, assignedOperationCount: manifests.length };
  });

  browser = await chromium.launch();
  await check("office_authenticated_direct_deep_link_and_reload", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    let blockedWrites = 0;
    await context.route(`${runtime}/**`, async (route) => {
      if (route.request().method() === "GET") return route.continue();
      blockedWrites++;
      await route.abort();
    });
    await page.goto(`${officeOrigin}/?module=financial-eligibility`);
    await page.getByLabel("Email", { exact: true }).fill("staging-office@megabin.local");
    await page.getByLabel("Password", { exact: true }).fill(process.env.STAGING_OFFICE_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("heading", { name: "Financial Eligibility", exact: true }).waitFor();
    assert.equal(
      await page.locator("html").getAttribute("data-build-sha"),
      process.env.EXPECTED_BUILD_SHA
    );
    await page.reload();
    await page.getByRole("heading", { name: "Financial Eligibility", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "Office sign in", exact: true }).count(),
      0
    );
    assert.equal(blockedWrites, 0);
    await page.screenshot({ path: `${output}/office-financial-eligibility.png`, fullPage: true });
    await context.close();
    return {
      buildSha: process.env.EXPECTED_BUILD_SHA,
      reloadRestoredWorkspace: true,
      blockedWrites
    };
  });
  await check("driver_frontend_release", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(driverOrigin);
    await page.getByRole("heading", { name: "Driver sign in", exact: true }).waitFor();
    assert.equal(
      await page.locator("html").getAttribute("data-build-sha"),
      process.env.EXPECTED_BUILD_SHA
    );
    await context.close();
    return { buildSha: process.env.EXPECTED_BUILD_SHA };
  });
  evidence.outcome = "Passed";
} catch {
  console.error(
    "Hosted Financial Eligibility verification failed; see sanitized check identities in evidence.json."
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  evidence.completedAt = new Date().toISOString();
  await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
}
