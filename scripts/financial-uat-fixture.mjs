import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const supabase = "https://xniweqdmswzljcgkfglx.supabase.co";
const runtime = `${supabase}/functions/v1/platform-runtime/api/v1`;
const output = ".cache/financial-hosted-uat/fixture.json";
export const financialFixture = Object.freeze([
  Object.freeze({
    customer: "ZC-100",
    client: "57000000-0000-0000-0000-000000000001",
    name: "Synthetic Client One",
    services: ["59000000-0000-0000-0000-000000000001", "59000000-0000-0000-0000-000000000002"]
  }),
  Object.freeze({
    customer: "ZC-200",
    client: "57000000-0000-0000-0000-000000000002",
    name: "Synthetic Client Two",
    services: ["59000000-0000-0000-0000-000000000003"]
  })
]);
const syncIdentity = "uat:accounting:UAT-FIN-001:mapped-projection:01";

export function validateFinancialFixtureInput(values) {
  assert.match(values.EXPECTED_BUILD_SHA ?? "", /^[a-f0-9]{40}$/);
  assert.equal(
    values.CONFIRM_FINANCIAL_FIXTURE,
    `PREPARE-UAT-FIN-001:${values.EXPECTED_BUILD_SHA}:ZC-100-ONE:ZC-200-TWO`
  );
}

export function fixtureWriteAllowed(path) {
  return (
    path === "/accounting/sync-runs" ||
    financialFixture.some(
      (item) =>
        path === `/accounting/reconciliation/zoho-books-fake/${item.customer}` ||
        item.services.some(
          (service) =>
            path === `/financial-eligibility/services/${service}/simulate` ||
            path === `/financial-eligibility/services/${service}/reevaluate`
        )
    )
  );
}

export async function prepareFinancialFixture(
  values,
  fetcher = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
) {
  const evidence = {
    caseId: "UAT-FIN-001",
    sourceSha: values.EXPECTED_BUILD_SHA,
    workflowRunId: values.GITHUB_RUN_ID,
    startedAt: new Date().toISOString(),
    outcome: "Failed",
    steps: []
  };
  let phase = "fixed_input";
  const record = (detail) => evidence.steps.push({ phase, ...detail });
  try {
    validateFinancialFixtureInput(values);
    assert(values.SUPABASE_PUBLISHABLE_KEY && values.STAGING_ACCOUNTING_PASSWORD);
    phase = "authenticate_existing_operator";
    const authResponse = await fetcher(`${supabase}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: values.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "staging-accounting@megabin.local",
        password: values.STAGING_ACCOUNTING_PASSWORD
      })
    });
    assert.equal(authResponse.status, 200);
    const session = await authResponse.json();
    assert.equal(session.user?.id, "c85c4c49-df71-4707-ab24-dfd6dd3225c1");
    assert(session.access_token);
    async function request(path, body) {
      if (body !== undefined) assert(fixtureWriteAllowed(path));
      const correlationId = crypto.randomUUID();
      const response = await fetcher(`${runtime}${path}`, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          "X-Correlation-Id": correlationId,
          "Idempotency-Key": syncIdentity
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true)
        record({
          requestPath: path,
          httpStatus: response.status,
          errorCode: result.error?.code ?? "invalid_envelope",
          correlationId
        });
      assert(response.ok && result.ok === true);
      return { data: result.data, correlationId, status: response.status };
    }
    phase = "verify_release_and_operator";
    const live = await fetcher(`${runtime}/health/live`, {
      redirect: "error",
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    assert.equal(live.status, 200);
    const health = await live.json();
    assert.equal(health.runtime?.environment, "staging");
    assert.equal(health.runtime?.buildId, values.EXPECTED_BUILD_SHA);
    record({ userId: session.user.id, buildSha: health.runtime.buildId });
    const profile = (await request("/office/profile")).data;
    assert.equal(profile.globalAccess, true);
    for (const permission of [
      "accounting.reconcile",
      "accounting.sync",
      "financial_eligibility.reevaluate"
    ])
      assert(profile.permissions.includes(permission));
    assert.equal((await request("/accounting/health")).data.provider, "zoho-books-fake");
    const clients = (await request("/master-data/clients?pageSize=100")).data.items;
    for (const item of financialFixture)
      assert(
        clients.some(
          (client) =>
            client.clientId === item.client &&
            client.displayName === item.name &&
            client.lifecycleStatus === "active"
        )
      );
    phase = "approved_customer_links";
    const queue = (await request("/accounting/reconciliation")).data.items;
    for (const item of financialFixture) {
      const row = queue.find(
        (row) => row.provider === "zoho-books-fake" && row.providerCustomerId === item.customer
      );
      if (!row) {
        const snapshot = (await request(`/accounting/clients/${item.client}`)).data;
        assert.equal(snapshot.providerCustomerId, item.customer);
        assert.equal(snapshot.reconciliationStatus, "mapped");
        continue;
      }
      assert.equal(row.classification, "unmatched");
      record({
        customer: item.customer,
        intendedClient: item.client,
        classification: row.classification,
        checkpoint: "before_link"
      });
      const result = await request(`/accounting/reconciliation/zoho-books-fake/${item.customer}`, {
        action: "link",
        clientId: item.client,
        reason: "User-approved UAT-FIN-001 synthetic fixture pairing; no automatic matching."
      });
      assert.equal(result.data.mappedClientId, item.client);
      record({
        customer: item.customer,
        clientId: item.client,
        correlationId: result.correlationId
      });
    }
    phase = "idempotent_mapped_projection_sync";
    const submitted = await request("/accounting/sync-runs", { syncMode: "initial_full" });
    let run;
    for (let attempt = 0; attempt < 30; attempt++) {
      run = (await request("/accounting/sync-runs")).data.items.find(
        (run) => run.syncRunId === submitted.data.syncRunId
      );
      if (["succeeded", "failed", "cancelled"].includes(run?.status)) break;
      await wait(2000);
    }
    assert.equal(run?.status, "succeeded");
    record({
      syncRunId: submitted.data.syncRunId,
      syncIdentity,
      status: run.status,
      duplicate: submitted.data.duplicate,
      correlationId: submitted.correlationId
    });
    phase = "verify_snapshots_and_preview_decisions";
    for (const item of financialFixture) {
      const snapshot = (await request(`/accounting/clients/${item.client}`)).data;
      assert.equal(snapshot.provider, "zoho-books-fake");
      assert.equal(snapshot.providerCustomerId, item.customer);
      assert.equal(snapshot.reconciliationStatus, "mapped");
      assert.equal(snapshot.isStale, false);
      for (const service of item.services) {
        const preview = (await request(`/financial-eligibility/services/${service}/simulate`, {}))
          .data;
        assert.equal(preview.clientId, item.client);
        assert.equal(preview.wouldHold, false);
        assert.notEqual(preview.suggestedStatus, "held");
        assert.equal(preview.inputs.freshness, "current");
        phase = "explicit_synthetic_decision";
        const result = await request(`/financial-eligibility/services/${service}/reevaluate`, {});
        record({
          clientId: item.client,
          serviceId: service,
          suggestedStatus: preview.suggestedStatus,
          correlationId: result.correlationId
        });
      }
    }
    phase = "verify_remaining_ambiguity_and_decisions";
    const unresolved = (await request("/accounting/reconciliation")).data.items;
    assert(
      unresolved.some(
        (row) => row.providerCustomerId === "ZC-300" && row.classification === "unmatched"
      )
    );
    const decisions = (await request("/financial-eligibility/decisions")).data.items;
    for (const item of financialFixture)
      for (const service of item.services) {
        const rows = decisions.filter((row) => row.clientServiceId === service);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].activeHold, false);
      }
    record({
      mappedClients: 2,
      expectedCurrentDecisions: 3,
      ambiguousCustomerRetained: "ZC-300",
      holdsCreated: false
    });
    evidence.outcome = "Passed";
  } catch {
    evidence.failedPhase = phase;
    // Never serialize request bodies, credentials, tokens, financial facts, or exceptions.
  }
  evidence.completedAt = new Date().toISOString();
  return evidence;
}

if (process.argv[1]?.endsWith("financial-uat-fixture.mjs")) {
  const evidence = await prepareFinancialFixture(process.env);
  await mkdir(".cache/financial-hosted-uat", { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`UAT-FIN-001 approved fixture: ${evidence.outcome}; sanitized evidence written.`);
  if (evidence.outcome !== "Passed") process.exitCode = 1;
}
