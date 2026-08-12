import { expect, test, type Page } from "@playwright/test";

const userId = "30000000-0000-4000-8000-000000000001";
const operationId = "31000000-0000-4000-8000-000000000001";
const stopId = "32000000-0000-4000-8000-000000000001";
const token = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ sub: userId, exp: 4102444800 }))}.test`;

async function driverSession(
  page: Page,
  actionOutcome: "accepted" | "conflict" = "accepted",
  tracking = false
) {
  await page.route("http://supabase.phase3a.test/**", (route) =>
    route.fulfill({
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
            lifecycleStatus: "available",
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
    return route.fulfill({
      json: {
        ok: true,
        data: {
          actionId: crypto.randomUUID(),
          outcome: actionOutcome,
          ...(actionOutcome === "conflict" ? { rejectionCode: "idempotency_key_reused" } : {})
        }
      }
    });
  });
  await page.goto("http://127.0.0.1:4175");
  await page.getByLabel("Email").fill("driver@phase3a.test");
  await page.getByLabel("Password").fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Driver Team A")).toBeVisible();
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

test("Driver keeps a conflicting action visible for attention", async ({ page, context }) => {
  await driverSession(page, "conflict");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Accept route" }).click();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("1 action(s) need attention and remain queued.")).toBeVisible();
});
