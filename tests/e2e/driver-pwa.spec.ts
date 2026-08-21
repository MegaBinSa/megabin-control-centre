import { expect, test, type Page } from "@playwright/test";

const userId = "30000000-0000-4000-8000-000000000001";
const operationId = "31000000-0000-4000-8000-000000000001";
const stopId = "32000000-0000-4000-8000-000000000001";
const token = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ sub: userId, exp: 4102444800 }))}.test`;

async function driverSession(
  page: Page,
  actionOutcome: "accepted" | "conflict" = "accepted",
  tracking = false,
  failedSignInAttempts = 0,
  startEligible = true
) {
  let authAttempts = 0;
  let lifecycleStatus = "available";
  const submittedActionTypes: string[] = [];
  await page.route("http://supabase.phase3a.test/**", (route) =>
    route.request().url().includes("/token") && authAttempts++ < failedSignInAttempts
      ? route.fulfill({ status: 400, json: { error: "invalid_grant" } })
      : route.fulfill({
          json: route.request().url().includes("/token")
            ? {
                access_token: token,
                refresh_token: "driver-refresh",
                expires_in: 3600,
                token_type: "bearer",
                user: { id: userId, role: "authenticated", email: "driver@phase3a.test" }
              }
            : { id: userId, role: "authenticated", email: "driver@phase3a.test" }
        })
  );
  await page.route("http://api.phase3a.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/driver/tracking/device"))
      return route.fulfill({
        json: {
          ok: true,
          data: tracking
            ? { deviceId: "33000000-0000-4000-8000-000000000001", status: "active" }
            : null
        }
      });
    if (path.endsWith("/driver/tracking/observations")) {
      const submitted = route.request().postDataJSON() as {
        observations: { observationId: string }[];
      };
      return route.fulfill({
        json: {
          ok: true,
          data: {
            receipts: submitted.observations.map((observation) => ({
              observationId: observation.observationId,
              outcome: "accepted"
            }))
          }
        }
      });
    }
    if (path.endsWith("/driver/route-operations"))
      return route.fulfill({ json: { ok: true, data: [{ routeOperationId: operationId }] } });
    if (path.endsWith("/manifest"))
      return route.fulfill({
        json: {
          ok: true,
          data: {
            routeOperationId: operationId,
            routeDate: "2026-08-20",
            lifecycleStatus,
            startEligibility: {
              eligible: startEligible,
              reasonCode: !startEligible ? "route_date_mismatch" : null
            },
            assignmentRevision: 1,
            manifestRevision: 1,
            team: { name: "Driver Team A" },
            vehicle: { displayName: "Truck A" },
            stops: []
          }
        }
      });
    if (path.endsWith("/stops"))
      return route.fulfill({
        json: {
          ok: true,
          data: {
            stops: [
              {
                routeOperationStopId: stopId,
                sequenceNumber: 1,
                address: { line1: "1 Offline Street" },
                plannedDrumUnits: 2,
                serviceFlags: { accessInstructions: "Use side gate", dangerousAnimal: true },
                execution: null
              }
            ]
          }
        }
      });
    if (path.endsWith("/freshness"))
      return route.fulfill({
        json: { ok: true, data: { stale: false, cancelled: false, superseded: false } }
      });
    if (path.endsWith("/actions")) {
      const body = route.request().postDataJSON() as { actionType: string; actionId: string };
      submittedActionTypes.push(body.actionType);
      if (actionOutcome === "conflict")
        return route.fulfill({
          json: {
            ok: true,
            data: {
              actionId: body.actionId,
              outcome: "conflict",
              rejectionCode: "idempotency_key_reused"
            }
          }
        });
      if (body.actionType === "accept" && lifecycleStatus === "available") {
        lifecycleStatus = "accepted";
        return route.fulfill({
          json: { ok: true, data: { actionId: body.actionId, outcome: "accepted" } }
        });
      }
      if (body.actionType === "start" && lifecycleStatus === "accepted") {
        lifecycleStatus = "in_progress";
        return route.fulfill({
          json: { ok: true, data: { actionId: body.actionId, outcome: "accepted" } }
        });
      }
      return route.fulfill({
        json: {
          ok: true,
          data: {
            actionId: body.actionId,
            outcome: "rejected",
            rejectionCode: "invalid_lifecycle_transition"
          }
        }
      });
    }
    if (path.endsWith("/complete")) lifecycleStatus = "completed";
    return route.fulfill({
      json: {
        ok: true,
        data: {
          actionId: crypto.randomUUID(),
          outcome: "accepted"
        }
      }
    });
  });
  await page.goto("http://127.0.0.1:4175");
  for (let attempt = 0; attempt <= failedSignInAttempts; attempt++) {
    await page.getByLabel("Email").fill("driver@phase3a.test");
    await page.getByLabel("Password").fill("synthetic-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    if (attempt < failedSignInAttempts)
      await expect(page.getByText("Sign in failed.")).toBeVisible();
  }
  await expect(page.getByText("Driver Team A")).toBeVisible();
  return { submittedActionTypes };
}

test("Driver works from the cached manifest and retains offline actions", async ({
  page,
  context
}) => {
  await driverSession(page);
  await expect(page.getByText("Dangerous animal warning")).toHaveCount(0);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Accept route" }).click();
  await expect(page.getByText(/Offline · 1 pending/)).toBeVisible();
  await page.getByRole("button", { name: "Start route" }).click();
  await expect(page.getByText(/Offline · 2 pending/)).toBeVisible();
  await page.getByText("1. 1 Offline Street").click();
  await expect(page.getByText("Dangerous animal warning")).toBeVisible();
  await page.getByLabel("Actual drums serviced").fill("2");
  await page.getByRole("button", { name: "Save outcome" }).click();
  await expect(page.getByText(/Offline · 3 pending/)).toBeVisible();
  await expect(page.getByText("1/1")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Driver Team A")).toBeVisible();
  await expect(page.getByText(/3 pending/)).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/0 pending/)).toBeVisible();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "Driver sign in" })).toBeVisible();
  const counts = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("megabin-driver-v1", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return Promise.all(
      ["data", "queue", "positions"].map(
        (store) =>
          new Promise<number>((resolve, reject) => {
            const request = database.transaction(store).objectStore(store).count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          })
      )
    );
  });
  expect(counts).toEqual([0, 0, 0]);
});

test("Driver GPS queues offline and batch uploads after reconnect", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:4175" });
  await context.setGeolocation({ latitude: -25.7479, longitude: 28.2293, accuracy: 15 });
  await context.setOffline(true);
  await context.setOffline(false);
  await driverSession(page, "accepted", true);
  await expect(page.getByText(/Tracking active/)).toBeVisible();
  await expect(page.getByText(/0 GPS pending/)).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => dispatchEvent(new Event("megabin:capture-location")));
  await expect(page.getByText(/[1-9]\d* GPS pending/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/[1-9]\d* GPS pending/)).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/0 GPS pending/)).toBeVisible();
});

test("GPS permission denial leaves route execution functional", async ({ page, context }) => {
  await context.clearPermissions();
  await driverSession(page, "accepted", true);
  await expect(page.getByText("GPS permission unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Accept route" }).click();
  await expect(page.getByText(/0 pending/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start route" })).toBeEnabled();
});

test("Driver reconciles a delayed duplicate Accept and can start normally", async ({ page }) => {
  const session = await driverSession(page);
  await page.getByRole("button", { name: "Accept route" }).click();
  await expect(page.getByText(/Status: accepted/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept route" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start route" })).toBeVisible();

  // Recreate the distinct second click captured by the pre-fix UI while its refresh was delayed.
  await page.evaluate(
    async ({ operationId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("megabin-driver-v1", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const duplicateId = "2e7ada54-e208-4ab4-8af4-ec32cdc4108e";
      await new Promise<void>((resolve, reject) => {
        const request = database
          .transaction("queue", "readwrite")
          .objectStore("queue")
          .put({
            actionId: duplicateId,
            routeOperationId: operationId,
            kind: "route",
            endpoint: `/driver/route-operations/${operationId}/actions`,
            body: {
              actionId: duplicateId,
              routeOperationId: operationId,
              assignmentRevision: 1,
              manifestRevision: 1,
              deviceTimestamp: new Date().toISOString(),
              clientSequence: 2,
              idempotencyKey: duplicateId,
              correlationId: "36712364-b521-4351-ad6e-ceb669030d3f",
              actionType: "accept",
              payloadVersion: 1,
              payload: {}
            },
            clientSequence: 2,
            state: "queued"
          });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      database.close();
    },
    { operationId }
  );

  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/0 pending/)).toBeVisible();
  await expect(page.getByText(/require attention/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Accept route" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start route" }).click();
  await expect(page.getByText(/Status: in_progress/)).toBeVisible();
  await expect(page.getByText(/0 pending/)).toBeVisible();

  const states = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("megabin-driver-v1", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<string[]>((resolve, reject) => {
      const request = database.transaction("queue").objectStore("queue").getAll();
      request.onsuccess = () => resolve(request.result.map((action) => action.state));
      request.onerror = () => reject(request.error);
    }).finally(() => database.close());
  });
  expect(states.sort()).toEqual(["reconciled", "synced", "synced"]);
  expect(session.submittedActionTypes).toEqual(["accept", "accept", "start"]);
});

test("successful Driver sign-in clears a prior authentication failure banner", async ({ page }) => {
  await driverSession(page, "accepted", false, 1);
  await expect(page.getByText("Sign in failed.")).toHaveCount(0);
});

test("Driver cannot start an accepted route outside its scheduled service date", async ({
  page
}) => {
  await driverSession(page, "accepted", false, 0, false);
  await page.getByRole("button", { name: "Accept route" }).click();
  await expect(page.getByText(/Status: accepted/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start route" })).toHaveCount(0);
  await expect(
    page.getByText(
      "This route can only be started on its scheduled service date. Contact Operations."
    )
  ).toBeVisible();
});

test("Driver keeps a conflicting action visible for attention", async ({ page, context }) => {
  await driverSession(page, "conflict");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Accept route" }).click();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/0 pending/)).toBeVisible();
  await expect(
    page.getByText(
      "1 action(s) for this route require attention and are not being retried automatically."
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept route" })).toHaveCount(0);
});

test("historical rejected work does not block a fresh assigned operation", async ({ page }) => {
  const session = await driverSession(page);
  const historicalOperationId = "621cf930-d80d-4b6a-a4e7-44a4896a57bc";
  const historicalActionId = "38f3ab68-2498-4b6f-8956-06060cefe886";

  await page.evaluate(
    async ({ historicalActionId, historicalOperationId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("megabin-driver-v1", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const request = database
          .transaction("queue", "readwrite")
          .objectStore("queue")
          .put({
            actionId: historicalActionId,
            routeOperationId: historicalOperationId,
            kind: "route",
            endpoint: `/driver/route-operations/${historicalOperationId}/actions`,
            body: {
              actionId: historicalActionId,
              routeOperationId: historicalOperationId,
              actionType: "start"
            },
            clientSequence: 3,
            state: "rejected",
            rejectionCode: "invalid_lifecycle_transition"
          });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      database.close();
    },
    { historicalActionId, historicalOperationId }
  );
  await page.reload();

  await expect(
    page.getByText(
      "1 historical action(s) from another route require attention. They do not block this route."
    )
  ).toBeVisible();
  await expect(page.getByText(/Online · 0 pending/)).toBeVisible();
  await page.getByRole("button", { name: "Accept route" }).click();
  await expect(page.getByText(/Status: accepted/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start route" })).toBeVisible();
  await page.getByRole("button", { name: "Start route" }).click();
  await expect(page.getByText(/Status: in_progress/)).toBeVisible();
  await expect(page.getByText(/0 pending/)).toBeVisible();

  const historical = await page.evaluate(async (historicalActionId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("megabin-driver-v1", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<{ routeOperationId: string; state: string }>((resolve, reject) => {
      const request = database.transaction("queue").objectStore("queue").get(historicalActionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).finally(() => database.close());
  }, historicalActionId);
  expect(historical).toMatchObject({
    routeOperationId: historicalOperationId,
    state: "rejected"
  });
  expect(session.submittedActionTypes).toEqual(["accept", "start"]);
});
