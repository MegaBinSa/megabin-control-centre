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
  }
  await check("office_frontend", values.MEGABIN_OFFICE_ORIGIN);
  await check("driver_frontend", values.MEGABIN_DRIVER_ORIGIN);
  await check(
    "runtime_liveness",
    `${values.VITE_MASTER_DATA_API_URL}/api/v1/health/live`,
    200,
    officeToken ? { headers: { Authorization: `Bearer ${officeToken}` } } : undefined
  );
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
