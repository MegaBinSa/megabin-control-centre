export async function runSmoke(values, fetchImpl = fetch) {
  const checks = [];
  const officeToken =
    values.STAGING_OFFICE_EMAIL && values.STAGING_OFFICE_PASSWORD
      ? await signIn(values, values.STAGING_OFFICE_EMAIL, values.STAGING_OFFICE_PASSWORD, fetchImpl)
      : null;
  async function check(name, url, expected = 200, init) {
    const response = await fetchImpl(url, { redirect: "error", ...init });
    const passed = Array.isArray(expected)
      ? expected.includes(response.status)
      : response.status === expected;
    checks.push({ name, passed, status: response.status });
    return response;
  }
  await check("office_frontend", values.MEGABIN_OFFICE_ORIGIN);
  await check("driver_frontend", values.MEGABIN_DRIVER_ORIGIN);
  const liveness = await check(
    "runtime_liveness",
    `${values.VITE_MASTER_DATA_API_URL}/api/v1/health/live`,
    200,
    officeToken ? { headers: { Authorization: `Bearer ${officeToken}` } } : undefined
  );
  if (liveness.ok && values.VITE_BUILD_SHA && values.VITE_DEPLOYMENT_ID) {
    const body = await liveness.json();
    const runtime = body.runtime ?? {};
    checks.push({
      name: "release_identity",
      passed:
        runtime.environment === "staging" &&
        runtime.buildSha === values.VITE_BUILD_SHA &&
        runtime.deploymentId === values.VITE_DEPLOYMENT_ID,
      status: liveness.status
    });
  }
  const allowedPreflight = await check(
    "allowed_cors_preflight",
    `${values.VITE_MASTER_DATA_API_URL}/api/v1/health/live`,
    204,
    { method: "OPTIONS", headers: { Origin: values.MEGABIN_OFFICE_ORIGIN } }
  );
  checks.push({
    name: "allowed_cors_header",
    passed:
      allowedPreflight.headers.get("access-control-allow-origin") === values.MEGABIN_OFFICE_ORIGIN,
    status: allowedPreflight.status
  });
  await check("unknown_cors_denial", `${values.VITE_MASTER_DATA_API_URL}/api/v1/health/live`, 403, {
    method: "OPTIONS",
    headers: { Origin: "https://unapproved.example.invalid" }
  });
  await check(
    "anonymous_office_denial",
    `${values.VITE_MASTER_DATA_API_URL}/api/v1/master-data/clients`,
    [401, 403]
  );
  if (officeToken) {
    await check(
      "authenticated_office",
      `${values.VITE_MASTER_DATA_API_URL}/api/v1/office/profile`,
      200,
      {
        headers: { Authorization: `Bearer ${officeToken}` }
      }
    );
    await check(
      "fake_routing_provider_health",
      `${values.VITE_MASTER_DATA_API_URL}/api/v1/route-providers/health?serviceRegionId=51000000-0000-0000-0000-000000000001`,
      200,
      { headers: { Authorization: `Bearer ${officeToken}` } }
    );
    await check(
      "fake_accounting_provider_health",
      `${values.VITE_MASTER_DATA_API_URL}/api/v1/accounting/health`,
      200,
      { headers: { Authorization: `Bearer ${officeToken}` } }
    );
    await check(
      "capture_communications_health",
      `${values.VITE_MASTER_DATA_API_URL}/api/v1/communications/provider-health`,
      200,
      { headers: { Authorization: `Bearer ${officeToken}` } }
    );
  }
  if (values.STAGING_DRIVER_EMAIL && values.STAGING_DRIVER_PASSWORD) {
    const driverToken = await signIn(
      values,
      values.STAGING_DRIVER_EMAIL,
      values.STAGING_DRIVER_PASSWORD,
      fetchImpl
    );
    await check(
      "authenticated_driver",
      `${values.VITE_DRIVER_API_URL}/api/v1/driver/route-operations`,
      200,
      {
        headers: { Authorization: `Bearer ${driverToken}` }
      }
    );
    await check(
      "driver_financial_denial",
      `${values.VITE_DRIVER_API_URL}/api/v1/accounting/status`,
      403,
      { headers: { Authorization: `Bearer ${driverToken}` } }
    );
  }
  if (values.MEGABIN_WEBSITE_ONBOARDING_URL) {
    await check(
      "synthetic_website_intake",
      `${values.MEGABIN_WEBSITE_ONBOARDING_URL}/api/v1/integrations/website/onboarding`,
      [200, 202],
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Integration-Key": values.MEGABIN_WEBSITE_ONBOARDING_INTEGRATION_KEY,
          "X-Integration-Secret": values.MEGABIN_WEBSITE_ONBOARDING_SECRET,
          "Idempotency-Key": `staging-smoke-${values.VITE_BUILD_SHA}`,
          "X-Correlation-Id": crypto.randomUUID()
        },
        body: JSON.stringify({
          sourceSubmissionId: `staging-smoke-${values.VITE_BUILD_SHA}`,
          payloadVersion: "1.0",
          submittedAt: "2026-01-01T00:00:00Z",
          client: { type: "individual", displayName: "Synthetic Staging Client" },
          contact: {
            name: "Synthetic Contact",
            mobile: "+27820000000",
            email: "staging-smoke@example.invalid",
            preferredLanguage: "english"
          },
          address: {
            addressLine1: "1 Synthetic Staging Road",
            suburb: "Synthetic",
            city: "Pretoria",
            postalCode: "0001",
            latitude: -25.75,
            longitude: 28.2
          },
          requestedDrumCount: 1,
          requestedStartDate: "2026-01-02",
          references: { customerReference: "staging-smoke", serviceReference: "staging-smoke" }
        })
      }
    );
  }
  return checks;
}

async function signIn(values, email, password, fetchImpl) {
  const response = await fetchImpl(`${values.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: values.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error("Synthetic staging authentication failed.");
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Synthetic staging access token was not returned.");
  return payload.access_token;
}

if (process.argv[1]?.endsWith("staging-smoke.mjs")) {
  const checks = await runSmoke(process.env);
  for (const check of checks)
    console.log(`${check.passed ? "PASS" : "FAIL"}: ${check.name} (${check.status})`);
  if (checks.some((check) => !check.passed)) process.exit(1);
}
