/* global window, indexedDB */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const supabase = "https://xniweqdmswzljcgkfglx.supabase.co";
const runtime = `${supabase}/functions/v1/platform-runtime/api/v1`;
const officeOrigin = "https://megabin-office-staging.pages.dev";
const driverOrigin = "https://megabin-driver-staging.pages.dev";
const output = ".cache/tracking-hosted-uat";
export const trackingFixture = Object.freeze({
  region: "51000000-0000-0000-0000-000000000001",
  otherRegion: "51000000-0000-0000-0000-000000000002",
  vehicle: "56000000-0000-0000-0000-000000000001",
  operation: "33cb2338-30ab-4d62-adfc-27ded32ee37b",
  reference: "uat:tracking:UAT-TRK-001:driver-pwa:01",
  ruleVersion: "uat:UAT-TRK-001:completion-v1",
  latitude: -25.7479,
  longitude: 28.2293
});
const users = {
  office: ["staging-office@megabin.local", "0c1eb73f-c8f8-42d2-8a8a-faabab7bead7"],
  driver: ["staging-driver@megabin.local", "aaa27c4a-040c-40d0-83d1-6a70d446c994"],
  processor: ["staging-accounting@megabin.local", "c85c4c49-df71-4707-ab24-dfd6dd3225c1"]
};
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function validateTrackingInput(values) {
  assert.match(values.EXPECTED_BUILD_SHA ?? "", /^[a-f0-9]{40}$/);
  if (values.EXECUTE_TRACKING_FIXTURE === "true")
    assert.equal(
      values.CONFIRM_TRACKING_FIXTURE,
      `EXECUTE-UAT-TRK-001:${values.EXPECTED_BUILD_SHA}:SYNTHETIC-VEHICLE-ONE`
    );
}
export function trackingWriteAllowed(path, deviceId, factId) {
  return (
    path === "/vehicle-tracking/devices" ||
    path === "/driver/tracking/observations" ||
    path === "/operational-intelligence/evaluate" ||
    (!!deviceId &&
      ["lifecycle", "assign"].some(
        (action) => path === `/vehicle-tracking/devices/${deviceId}/${action}`
      )) ||
    (!!factId &&
      ["acknowledge", "resolve"].some(
        (action) => path === `/operational-intelligence/facts/${factId}/${action}`
      ))
  );
}

// This retrospective completion classification uses the preserved manifest and
// actual Driver execution. It does not claim current GPS belongs to an old route.
export function completionEvaluation(operation, execution) {
  assert.equal(operation.routeOperationId, trackingFixture.operation);
  assert.equal(operation.currentVehicleId, trackingFixture.vehicle);
  assert.equal(operation.serviceRegionId, trackingFixture.region);
  assert.equal(operation.lifecycleStatus, "completed");
  assert(operation.startedAt && operation.completedAt);
  assert.equal(operation.manifest.manifestRevision, operation.manifestRevision);
  assert.equal(execution.stops.length, 1);
  const stop = execution.stops[0];
  assert.equal(stop.outcomeCode, "cleaned");
  assert.equal(stop.executionStatus, "completed");
  assert.equal(stop.actualDrumCount, 2);
  assert.equal(stop.recordedBy, users.driver[1]);
  return {
    snapshot: {
      serviceRegionId: trackingFixture.region,
      vehicleId: trackingFixture.vehicle,
      routeOperationId: trackingFixture.operation,
      sourceRouteVersionId: operation.publishedRouteVersionId,
      manifestRevision: operation.manifestRevision,
      routeStatus: operation.lifecycleStatus,
      now: operation.completedAt,
      plannedStartAt: operation.manifest.plannedStartAt,
      plannedEndAt: operation.manifest.plannedEndAt,
      startedAt: operation.startedAt,
      completedAt: operation.completedAt,
      trackingHealth: "unknown",
      points: [],
      stops: [
        {
          stopId: stop.routeOperationStopId,
          sequence: 1,
          latitude: -25.75,
          longitude: 28.24,
          authoritativeOutcome: stop.outcomeCode,
          authoritativeCompletedAt: stop.recordedAt
        }
      ]
    },
    rules: {
      arrivalRadiusMetres: 75,
      departureRadiusMetres: 110,
      minimumDwellSeconds: 120,
      corridorToleranceMetres: 250,
      deviationMinimumObservations: 3,
      stationarySeconds: 900,
      stationaryRadiusMetres: 25,
      lateStartToleranceSeconds: 600,
      interStopDurationMultiplier: 2,
      outsideHoursGraceSeconds: 900,
      minimumAccuracyMetres: 100,
      completionToleranceSeconds: 900,
      ruleVersion: trackingFixture.ruleVersion
    }
  };
}

export async function runTrackingUat(values, fetcher = fetch) {
  const evidence = {
    caseId: "UAT-TRK-001",
    environment: "staging",
    sourceSha: values.EXPECTED_BUILD_SHA,
    verificationCommit: values.GITHUB_SHA,
    workflowRunId: values.GITHUB_RUN_ID,
    startedAt: new Date().toISOString(),
    mode: values.EXECUTE_TRACKING_FIXTURE === "true" ? "execute" : "preflight",
    outcome: "Failed",
    checks: []
  };
  let phase = "fixed_input",
    deviceId,
    factId,
    browser;
  const record = (detail = {}) => evidence.checks.push({ phase, ...detail });
  const tokens = {};
  async function request(role, path, body, expected = 200) {
    if (body !== undefined) {
      assert.equal(evidence.mode, "execute");
      assert(trackingWriteAllowed(path, deviceId, factId));
    }
    const correlationId = crypto.randomUUID();
    const response = await fetcher(`${runtime}${path}`, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${tokens[role]}`,
        "Content-Type": "application/json",
        "Idempotency-Key": trackingFixture.reference,
        "X-Correlation-Id": correlationId
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const result = await response.json();
    if (response.status !== expected || (expected < 400 && result.ok !== true)) {
      record({
        requestPath: path,
        status: response.status,
        code: result.error?.code,
        correlationId
      });
      throw new Error("request_failed");
    }
    if (expected === 403) {
      assert.equal(result.ok, false);
      assert.equal(result.data, undefined);
      assert.equal(result.items, undefined);
      record({ requestPath: path, status: 403, code: result.error?.code, correlationId });
    }
    return result.data;
  }
  try {
    validateTrackingInput(values);
    await mkdir(output, { recursive: true });
    phase = "verify_existing_identities_and_permissions";
    for (const [role, [email, id]] of Object.entries(users)) {
      const password =
        values[
          role === "processor"
            ? "STAGING_ACCOUNTING_PASSWORD"
            : `STAGING_${role.toUpperCase()}_PASSWORD`
        ];
      assert(password && values.SUPABASE_PUBLISHABLE_KEY);
      const response = await fetcher(`${supabase}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: values.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      assert.equal(response.status, 200);
      const session = await response.json();
      assert.equal(session.user?.id, id);
      assert.equal(session.user?.email, email);
      assert(session.access_token);
      tokens[role] = session.access_token;
    }
    const office = await request("office", "/office/profile");
    assert.equal(office.globalAccess, false);
    assert.deepEqual(office.serviceRegionIds, [trackingFixture.region]);
    for (const permission of [
      "vehicle_tracking.read",
      "vehicle_tracking.manage_devices",
      "vehicle_tracking.assign_devices",
      "operational_intelligence.review",
      "needs_attention.read"
    ])
      assert(office.permissions.includes(permission));
    const processor = await request("processor", "/office/profile");
    assert(processor.permissions.includes("operational_intelligence.process"));
    const driver = await request("driver", "/office/profile");
    assert(driver.permissions.includes("vehicle_tracking.ingest"));
    assert(!driver.permissions.includes("vehicle_tracking.read"));
    assert(!driver.permissions.includes("operational_intelligence.read"));
    record({
      officeUserId: users.office[1],
      driverUserId: users.driver[1],
      processorUserId: users.processor[1]
    });
    phase = "verify_deployed_release";
    const healthResponse = await fetcher(`${runtime}/health/live`, {
      headers: { Authorization: `Bearer ${tokens.office}` },
      redirect: "error"
    });
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.runtime.environment, "staging");
    assert.equal(health.runtime.buildId, values.EXPECTED_BUILD_SHA);
    record({ buildSha: health.runtime.buildId, deploymentId: health.runtime.deploymentId });
    phase = "preserved_authoritative_operation";
    const operation = await request("office", `/route-operations/${trackingFixture.operation}`);
    const execution = await request(
      "office",
      `/route-operations/${trackingFixture.operation}/execution`
    );
    const evaluation = completionEvaluation(operation, execution);
    const operationDigest = digest(operation),
      executionDigest = digest(execution);
    record({
      operationId: trackingFixture.operation,
      operationDigest,
      executionDigest,
      status: "completed",
      authoritativeOutcome: "cleaned",
      actualDrums: 2
    });
    phase = "tracking_and_intelligence_scope_preflight";
    const query = `?serviceRegionId=${trackingFixture.region}`;
    const devices = await request("office", `/vehicle-tracking/devices${query}`);
    const positions = await request("office", `/vehicle-tracking/positions${query}`);
    const position = positions.find((p) => p.vehicleId === trackingFixture.vehicle);
    assert.equal(position?.vehicleDisplayName, "Synthetic Collection Vehicle");
    assert.equal(position.registrationReference, "TEST-001-GP");
    const matches = devices.filter((d) => d.deviceReference === trackingFixture.reference);
    assert(matches.length <= 1);
    assert(
      devices.every(
        (d) => d.ownerUserId !== users.driver[1] || d.deviceReference === trackingFixture.reference
      )
    );
    assert(
      devices.every(
        (d) =>
          d.vehicleId !== trackingFixture.vehicle || d.deviceReference === trackingFixture.reference
      )
    );
    const facts = await request("office", `/operational-intelligence/facts${query}`);
    assert(
      facts.every(
        (f) =>
          f.routeOperationId !== trackingFixture.operation ||
          f.ruleVersion === trackingFixture.ruleVersion
      )
    );
    record({
      existingFixtureDevices: matches.length,
      vehicleId: trackingFixture.vehicle,
      existingFixtureFacts: facts.filter((f) => f.ruleVersion === trackingFixture.ruleVersion)
        .length
    });
    phase = "driver_all_fleet_and_intelligence_denial";
    for (const path of [
      "/vehicle-tracking/devices",
      "/vehicle-tracking/positions",
      "/live-operations",
      "/operational-intelligence/facts",
      "/needs-attention"
    ])
      await request("driver", `${path}${query}`, undefined, 403);
    phase = "office_cross_region_denial";
    for (const path of [
      "/vehicle-tracking/positions",
      "/operational-intelligence/facts",
      "/needs-attention"
    ])
      await request(
        "office",
        `${path}?serviceRegionId=${trackingFixture.otherRegion}`,
        undefined,
        403
      );
    if (evidence.mode === "preflight") {
      evidence.outcome = "Preflight Passed";
      return evidence;
    }
    phase = "prepare_fixed_synthetic_device";
    let device = matches[0];
    if (!device)
      device = await request(
        "office",
        "/vehicle-tracking/devices",
        {
          serviceRegionId: trackingFixture.region,
          providerKey: "driver-pwa",
          deviceReference: trackingFixture.reference,
          deviceName: "UAT-TRK-001 Synthetic Driver GPS",
          deviceType: "driver_pwa",
          ownerUserId: users.driver[1],
          metadata: {
            namespace: "megabin-uat",
            sourceReference: trackingFixture.reference,
            syntheticOnly: true
          }
        },
        201
      );
    deviceId = device.vehicleTrackingDeviceId;
    assert(deviceId);
    assert.equal(device.ownerUserId, users.driver[1]);
    assert.equal(device.providerKey, "driver-pwa");
    if (device.lifecycleStatus === "registered")
      device = await request("office", `/vehicle-tracking/devices/${deviceId}/lifecycle`, {
        target: "active",
        reason: "UAT-TRK-001 fixed synthetic GPS only"
      });
    assert.equal(device.lifecycleStatus, "active");
    if (!device.vehicleId)
      await request("office", `/vehicle-tracking/devices/${deviceId}/assign`, {
        vehicleId: trackingFixture.vehicle,
        reason: "UAT-TRK-001 synthetic vehicle assignment"
      });
    else assert.equal(device.vehicleId, trackingFixture.vehicle);
    const own = await request("driver", "/driver/tracking/device");
    assert.equal(own.deviceId, deviceId);
    assert.equal(own.vehicleId, trackingFixture.vehicle);
    record({ deviceId, vehicleId: own.vehicleId });
    phase = "deterministic_observations_duplicate_and_late_order";
    // Deliberately submit the older point after the newer point. An exact retry
    // must return duplicate receipts without moving the current marker backwards.
    const now = Date.now();
    const points = [0, -90000].map((offset, index) => ({
      observationId: crypto.randomUUID(),
      recordedAt: new Date(now + offset).toISOString(),
      latitude: trackingFixture.latitude,
      longitude: trackingFixture.longitude,
      accuracyMetres: 15,
      speedMetresPerSecond: 0,
      clientSequence: index + 1,
      idempotencyKey: `${trackingFixture.reference}:${values.GITHUB_RUN_ID}:${index}`,
      correlationId: crypto.randomUUID(),
      sourceProvider: "driver-pwa"
    }));
    const body = { deviceId, observations: points };
    const accepted = await request("driver", "/driver/tracking/observations", body);
    assert.deepEqual(
      accepted.receipts.map((r) => r.outcome),
      ["accepted", "accepted"]
    );
    const duplicate = await request("driver", "/driver/tracking/observations", body);
    assert.deepEqual(
      duplicate.receipts.map((r) => r.outcome),
      ["duplicate", "duplicate"]
    );
    const current = (await request("office", `/vehicle-tracking/positions${query}`)).find(
      (p) => p.vehicleId === trackingFixture.vehicle
    );
    assert.equal(Date.parse(current.recordedAt), Date.parse(points[0].recordedAt));
    assert.equal(current.health, "healthy");
    assert.equal(Number(current.latitude), trackingFixture.latitude);
    assert.equal(Number(current.longitude), trackingFixture.longitude);
    record({
      observationIds: points.map((p) => p.observationId),
      outcomes: ["accepted", "accepted"],
      replayOutcomes: ["duplicate", "duplicate"],
      latePointDidNotRewind: true,
      health: current.health
    });
    browser = await chromium.launch();
    phase = "driver_pwa_offline_buffer_reload_reconnect_logout";
    const context = await browser.newContext();
    // Supply only the fixed synthetic depot coordinates. Hold callbacks until
    // explicitly released so timer/background GPS cannot manufacture extra data.
    await context.addInitScript(
      ({ latitude, longitude }) => {
        window.uatGpsCallbacks = [];
        Object.defineProperty(navigator, "geolocation", {
          value: {
            getCurrentPosition: (success) => window.uatGpsCallbacks.push(success)
          }
        });
        window.releaseUatGps = () => {
          const callback = window.uatGpsCallbacks.shift();
          if (!callback) throw new Error("No pending synthetic GPS capture");
          callback({
            timestamp: Date.now(),
            coords: { latitude, longitude, accuracy: 15, altitude: null, heading: null, speed: 0 }
          });
        };
      },
      { latitude: trackingFixture.latitude, longitude: trackingFixture.longitude }
    );
    let blockedOperationalWrites = 0,
      uploaded = [];
    await context.route(`${runtime}/**`, async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (req.method() === "GET") return route.continue();
      if (req.method() === "POST" && path.endsWith("/driver/tracking/observations")) {
        const batch = req.postDataJSON();
        assert.equal(batch.deviceId, deviceId);
        assert.equal(batch.observations.length, 1);
        for (const point of batch.observations) {
          assert.equal(point.latitude, trackingFixture.latitude);
          assert.equal(point.longitude, trackingFixture.longitude);
          uploaded.push(point.observationId);
        }
        return route.continue();
      }
      blockedOperationalWrites++;
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(driverOrigin);
    await page.getByLabel("Email", { exact: true }).fill(users.driver[0]);
    await page.getByLabel("Password", { exact: true }).fill(values.STAGING_DRIVER_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No route assigned", exact: true })
    ).toBeVisible();
    assert.equal(
      await page.locator("html").getAttribute("data-build-sha"),
      values.EXPECTED_BUILD_SHA
    );
    await page.waitForFunction(() => window.uatGpsCallbacks.length > 0);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await context.setOffline(true);
    await page.evaluate(() => window.releaseUatGps());
    await expect(page.getByText(/1 GPS pending/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/1 GPS pending/)).toBeVisible();
    await page.screenshot({ path: `${output}/driver-offline-buffer.png`, fullPage: true });
    await context.setOffline(false);
    await expect(page.getByText(/0 GPS pending/)).toBeVisible();
    assert.equal(uploaded.length, 1);
    assert.equal(blockedOperationalWrites, 0);
    await page.getByRole("button", { name: "Logout", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Driver sign in", exact: true })).toBeVisible();
    const counts = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("megabin-driver-v1", 2);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject();
      });
      const result = await Promise.all(
        ["data", "queue", "positions"].map(
          (store) =>
            new Promise((resolve, reject) => {
              const r = db.transaction(store).objectStore(store).count();
              r.onsuccess = () => resolve(r.result);
              r.onerror = () => reject();
            })
        )
      );
      db.close();
      return result;
    });
    assert.deepEqual(counts, [0, 0, 0]);
    await context.close();
    record({
      uploadedObservationIds: uploaded,
      persistedAcrossOfflineReload: true,
      pendingAfterReconnect: 0,
      logoutStoreCounts: counts,
      blockedOperationalWrites
    });
    phase = "retrospective_completion_intelligence";
    // No current GPS is attributed to this historical completed route. Only its
    // immutable planned window and actual Driver-recorded completion are used.
    const priorFact = facts.find((f) => f.ruleVersion === trackingFixture.ruleVersion);
    if (priorFact) {
      assert.equal(priorFact.lifecycleStatus, "resolved");
      factId = priorFact.operationalFactId;
    } else {
      const response = await request(
        "processor",
        "/operational-intelligence/evaluate",
        evaluation,
        202
      );
      assert.equal(response.accepted, true);
      await expect
        .poll(
          async () => {
            const list = await request("office", `/operational-intelligence/facts${query}`);
            const match = list.filter((f) => f.ruleVersion === trackingFixture.ruleVersion);
            assert(match.length <= 1);
            factId = match[0]?.operationalFactId;
            return match.length;
          },
          { timeout: 30000 }
        )
        .toBe(1);
      const fact = await request("office", `/operational-intelligence/facts/${factId}`);
      assert.equal(fact.factType, "completion_timing");
      assert.equal(fact.evidence.classification, "early");
      assert.equal(fact.lifecycleStatus, "open");
      assert.equal(fact.firstObservationId, null);
      const needs = await request("office", `/needs-attention${query}`);
      assert.equal(
        needs.filter((n) => n.sourceId === factId && n.lifecycleStatus === "open").length,
        1
      );
      const inferredEvidence = digest(fact.evidence);
      phase = "office_browser_review";
      const reviewContext = await browser.newContext();
      let reviewWrites = 0;
      await reviewContext.route(`${runtime}/**`, async (route) => {
        const req = route.request();
        if (req.method() === "GET") return route.continue();
        const path = new URL(req.url()).pathname.replace(/^.*\/api\/v1/, "");
        if (
          req.method() === "POST" &&
          ["acknowledge", "resolve"].some(
            (action) => path === `/operational-intelligence/facts/${factId}/${action}`
          )
        ) {
          reviewWrites++;
          return route.continue();
        }
        return route.abort();
      });
      const reviewPage = await reviewContext.newPage();
      await reviewPage.goto(`${officeOrigin}/?module=live-vehicles`);
      await reviewPage.getByLabel("Email", { exact: true }).fill(users.office[0]);
      await reviewPage.getByLabel("Password", { exact: true }).fill(values.STAGING_OFFICE_PASSWORD);
      await reviewPage.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(
        reviewPage.getByRole("heading", { name: "Live Vehicles", exact: true })
      ).toBeVisible();
      await expect(
        reviewPage.getByText("UAT-TRK-001 Synthetic Driver GPS", { exact: false }).first()
      ).toBeVisible();
      await reviewPage.screenshot({ path: `${output}/office-live-vehicles.png`, fullPage: true });
      await reviewPage.goto(`${officeOrigin}/?module=live-operations`);
      await expect(
        reviewPage.getByRole("heading", { name: "Live Operations", exact: true })
      ).toBeVisible();
      await expect(
        reviewPage.getByRole("heading", { name: "completion timing · info", exact: true })
      ).toBeVisible();
      await reviewPage.screenshot({
        path: `${output}/office-intelligence-open.png`,
        fullPage: true
      });
      await reviewPage.locator(`[data-fact="${factId}"][data-action="acknowledge"]`).click();
      await expect
        .poll(
          async () =>
            (await request("office", `/operational-intelligence/facts/${factId}`)).lifecycleStatus
        )
        .toBe("acknowledged");
      reviewPage.once("dialog", (dialog) =>
        dialog.accept(
          "UAT-TRK-001 reviewed historical synthetic early-completion classification; Driver outcome remains authoritative."
        )
      );
      await reviewPage.locator(`[data-fact="${factId}"][data-action="resolve"]`).click();
      await expect
        .poll(
          async () =>
            (await request("office", `/operational-intelligence/facts/${factId}`)).lifecycleStatus
        )
        .toBe("resolved");
      assert.equal(reviewWrites, 2);
      await reviewPage.screenshot({
        path: `${output}/office-intelligence-resolved.png`,
        fullPage: true
      });
      await reviewContext.close();
      const resolved = await request("office", `/operational-intelligence/facts/${factId}`);
      assert.equal(digest(resolved.evidence), inferredEvidence);
      assert.equal(resolved.resolvedBy, users.office[1]);
    }
    const needsAfter = await request("office", `/needs-attention${query}`);
    assert.equal(
      needsAfter.filter((n) => n.sourceId === factId && n.lifecycleStatus === "resolved").length,
      1
    );
    const progress = await request(
      "office",
      `/live-operations/routes/${trackingFixture.operation}/progress`
    );
    assert.equal(progress.authoritativeCompletedStops, 1);
    assert.equal(progress.inferredVisitedStops, 0);
    assert.equal(progress.remainingStops, 0);
    record({
      factId,
      factType: "completion_timing",
      status: "resolved",
      authoritativeCompletedStops: 1,
      inferredVisitedStops: 0,
      currentGpsNotAttributedToHistoricalRoute: true
    });
    phase = "authoritative_operation_and_driver_outcomes_unchanged";
    assert.equal(
      digest(await request("office", `/route-operations/${trackingFixture.operation}`)),
      operationDigest
    );
    assert.equal(
      digest(await request("office", `/route-operations/${trackingFixture.operation}/execution`)),
      executionDigest
    );
    record({ operationDigest, executionDigest });
    evidence.outcome = "Passed";
  } catch {
    // Exceptions may contain credentials, payloads or GPS. Keep only phase and
    // explicit safe request diagnostics, never raw errors or assertion values.
    evidence.failedPhase = phase;
  } finally {
    await browser?.close();
    evidence.completedAt = new Date().toISOString();
  }
  return evidence;
}

if (process.argv[1]?.endsWith("tracking-hosted-uat.mjs")) {
  const evidence = await runTrackingUat(process.env);
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600
  });
  console.log(`UAT-TRK-001: ${evidence.outcome}; sanitized evidence written.`);
  if (!["Passed", "Preflight Passed"].includes(evidence.outcome)) process.exitCode = 1;
}
