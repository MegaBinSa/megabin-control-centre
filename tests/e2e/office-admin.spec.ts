import { expect, test, type Page } from "@playwright/test";

const userId = "10000000-0000-4000-8000-000000000001";
const token = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ sub: userId, exp: 4102444800 }))}.test`;

async function syntheticSession(
  page: Page,
  permissions = ["master_data.read", "master_data.write", "clients.sensitive.read"],
  onWrite?: (body: unknown) => void
): Promise<void> {
  await page.route("http://supabase.phase1b.test/**", async (route) => {
    if (route.request().url().includes("/token"))
      await route.fulfill({
        json: {
          access_token: token,
          refresh_token: "synthetic-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id: userId,
            aud: "authenticated",
            role: "authenticated",
            email: "office@phase1b.test"
          }
        }
      });
    else
      await route.fulfill({
        json: {
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          email: "office@phase1b.test"
        }
      });
  });
  await page.route("http://api.phase1b.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/office/profile"))
      return route.fulfill({
        json: {
          ok: true,
          data: { userId, displayName: "Synthetic Office User", permissions, serviceRegionIds: [] }
        }
      });
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { ok: true, data: { items: [], page: 1, pageSize: 25, total: 0 } }
      });
    onWrite?.(route.request().postDataJSON());
    return route.fulfill({
      status: route.request().method() === "POST" ? 201 : 200,
      json: { ok: true, data: { id: crypto.randomUUID(), updatedAt: new Date().toISOString() } }
    });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("office@phase1b.test");
  await page.getByLabel("Password").fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("Office login restores an authorized administration shell", async ({ page }) => {
  await syntheticSession(page);
  await expect(page.getByText("Synthetic Office User")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clients", exact: true })).toBeVisible();
});

test("authorized Office user can create a synthetic client", async ({ page }) => {
  await syntheticSession(page);
  await page.getByRole("button", { name: "Add Client" }).click();
  await page.getByLabel("Display name").fill("Synthetic Browser Client");
  const [request] = await Promise.all([
    page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/master-data/clients")
    ),
    page.getByRole("button", { name: "Save" }).click()
  ]);
  expect(request.postDataJSON()).toMatchObject({
    clientType: "individual",
    displayName: "Synthetic Browser Client"
  });
});

test("Driver Team is denied Office master-data navigation", async ({ page }) => {
  await syntheticSession(page, []);
  await expect(page.getByRole("heading", { name: "Office access unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clients", exact: true })).toHaveCount(0);
});

test("user without sensitive permission cannot see client controls", async ({ page }) => {
  await syntheticSession(page, ["master_data.read", "master_data.write"]);
  await expect(page.getByRole("button", { name: "Clients", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Service Addresses" })).toBeVisible();
});

for (const flow of [
  {
    module: "Client Contacts",
    add: "Add Client Contact",
    fields: [
      ["Client ID", userId],
      ["Contact name", "Primary Contact"],
      ["Mobile", "082 123 4567"]
    ]
  },
  {
    module: "Service Addresses",
    add: "Add Service Address",
    fields: [
      ["Address line 1", "10 Synthetic Street"],
      ["Suburb", "Test"],
      ["City", "Pretoria"]
    ]
  },
  {
    module: "Client Services",
    add: "Add Client Service",
    fields: [
      ["Client ID", userId],
      ["Service address ID", userId]
    ]
  },
  {
    module: "Service Configurations",
    add: "Add Service Configuration",
    fields: [
      ["Client service ID", userId],
      ["Region ID", userId],
      ["Configured drums", "2"],
      ["Effective from", "2026-08-11"]
    ]
  }
])
  test(`create ${flow.module.toLowerCase()}`, async ({ page }) => {
    await syntheticSession(page);
    await page.getByRole("button", { name: flow.module }).click();
    await page.getByRole("button", { name: flow.add }).click();
    for (const [label, value] of flow.fields) await page.getByLabel(label).fill(value);
    const [request] = await Promise.all([
      page.waitForRequest(
        (candidate) => candidate.method() === "POST" && candidate.url().includes("/master-data/")
      ),
      page.getByRole("button", { name: "Save" }).click()
    ]);
    expect(request.postDataJSON()).toBeTruthy();
  });

const vehicle = {
  vehicleId: userId,
  serviceRegionId: userId,
  registrationReference: "TEST-01",
  displayName: "Synthetic Vehicle",
  operationalAvailability: "available",
  isActive: true,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z"
};
const client = {
  clientId: userId,
  clientType: "individual",
  displayName: "Synthetic Client",
  lifecycleStatus: "active",
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z"
};

test("edit a vehicle", async ({ page }) => {
  await syntheticSession(page);
  await page.route("**/api/v1/master-data/vehicles*", (route) =>
    route.fulfill({
      json: { ok: true, data: { items: [vehicle], page: 1, pageSize: 25, total: 1 } }
    })
  );
  await page.getByRole("button", { name: "Vehicles" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  const [request] = await Promise.all([
    page.waitForRequest((candidate) => candidate.method() === "PATCH"),
    page.getByRole("button", { name: "Save" }).click()
  ]);
  expect(request.method()).toBe("PATCH");
});

test("archive a client", async ({ page }) => {
  await syntheticSession(page);
  await page.route("**/api/v1/master-data/clients*", (route) =>
    route.fulfill({
      json: { ok: true, data: { items: [client], page: 1, pageSize: 25, total: 1 } }
    })
  );
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clients", exact: true }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  const [request] = await Promise.all([
    page.waitForRequest((candidate) => candidate.url().endsWith("/archive")),
    page.getByRole("button", { name: "Archive" }).click()
  ]);
  expect(request.method()).toBe("POST");
});

test("cross-region denial is rendered safely", async ({ page }) => {
  await syntheticSession(page);
  await page.route("**/api/v1/master-data/vehicles*", (route) =>
    route.fulfill({
      status: 403,
      json: {
        ok: false,
        error: {
          code: "permission_denied",
          message: "Permission denied.",
          correlationId: "test-correlation"
        }
      }
    })
  );
  await page.getByRole("button", { name: "Vehicles" }).click();
  await expect(page.getByText("Permission denied.")).toBeVisible();
});

test("stale update conflict requires refresh", async ({ page }) => {
  await syntheticSession(page);
  await page.route("**/api/v1/master-data/vehicles*", (route) =>
    route.fulfill({
      json: { ok: true, data: { items: [vehicle], page: 1, pageSize: 25, total: 1 } }
    })
  );
  await page.getByRole("button", { name: "Vehicles" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.route(`**/api/v1/master-data/vehicles/${userId}`, (route) =>
    route.fulfill({
      status: 409,
      json: {
        ok: false,
        error: {
          code: "conflict",
          message: "The record changed since it was loaded. Refresh and retry.",
          correlationId: "test-correlation"
        }
      }
    })
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("The record changed since it was loaded. Refresh and retry.")
  ).toBeVisible();
});

test("geography map editor supports draw, cancel, impact preview, and save", async ({ page }) => {
  await syntheticSession(page, [
    "master_data.read",
    "master_data.write",
    "geography.read",
    "geography.write"
  ]);
  const regionId = "20000000-0000-4000-8000-000000000001";
  const territoryId = "30000000-0000-4000-8000-000000000001";
  await page.route("**/api/v1/master-data/service-regions*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          items: [{ serviceRegionId: regionId, name: "Synthetic Region" }],
          page: 1,
          pageSize: 25,
          total: 1
        }
      }
    })
  );
  await page.route("**/api/v1/geography/map*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          territories: [
            {
              territoryId,
              name: "Central",
              priority: 10,
              serviceRegionId: regionId,
              defaultDepotId: null,
              serviceStatus: "active",
              isActive: true,
              preferredCollectionDays: [],
              eligibleTeamIds: [],
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [28.1, -25.9],
                    [28.3, -25.9],
                    [28.3, -25.7],
                    [28.1, -25.7],
                    [28.1, -25.9]
                  ]
                ]
              },
              updatedAt: "2026-08-12T00:00:00Z"
            }
          ],
          depots: [
            {
              depotId: "40000000-0000-4000-8000-000000000001",
              name: "Depot",
              serviceRegionId: regionId,
              latitude: -25.75,
              longitude: 28.2,
              geofenceRadiusMetres: 100,
              isActive: true,
              updatedAt: "2026-08-12T00:00:00Z"
            }
          ],
          addresses: []
        }
      }
    })
  );
  await page.route("**/api/v1/geography/territories/*/impact-preview", (route) =>
    route.fulfill({ json: { ok: true, data: [{ reason: "fell_outside" }] } })
  );
  await page.getByRole("button", { name: "Geography" }).click();
  await expect(page.getByLabel("Geography configuration map")).toBeVisible();
  await page.getByRole("button", { name: "Draw territory" }).click();
  await expect(page.getByRole("heading", { name: "Territory editor" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: /Central/ }).click();
  await page.getByRole("button", { name: "Edit geometry and metadata" }).click();
  await page.getByRole("button", { name: "Preview impact" }).click();
  await expect(page.getByText("1 active service(s) require review if saved.")).toBeVisible();
  const [request] = await Promise.all([
    page.waitForRequest(
      (candidate) =>
        candidate.method() === "PUT" &&
        candidate.url().includes(`/geography/territories/${territoryId}`)
    ),
    page.getByRole("button", { name: "Save" }).click()
  ]);
  expect(request.postDataJSON()).toMatchObject({ name: "Central", priority: 10 });
});

test("Office daily roster generate, edit, ready, and lock workflow", async ({ page }) => {
  await syntheticSession(page, [
    "master_data.read",
    "roster.read",
    "roster.write",
    "roster.generate",
    "roster.lock",
    "availability.manage"
  ]);
  const regionId = "b2000000-0000-4000-8000-000000000001",
    dayId = "b3000000-0000-4000-8000-000000000001",
    entryId = "b4000000-0000-4000-8000-000000000001";
  let status = "draft";
  let generated = false;
  await page.route("**/api/v1/master-data/service-regions*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          items: [{ serviceRegionId: regionId, name: "Synthetic Region" }],
          page: 1,
          pageSize: 25,
          total: 1
        }
      }
    })
  );
  const roster = () => ({
    operationalDay: {
      operationalDayId: dayId,
      serviceDate: "2026-08-20",
      serviceRegionId: regionId,
      timezone: "Africa/Johannesburg",
      lifecycleStatus: status,
      generatedAt: "2026-08-20T05:00:00Z",
      lockedAt: status === "locked" ? "2026-08-20T05:30:00Z" : null,
      updatedAt: `2026-08-20T05:0${status.length}:00Z`
    },
    entries: [
      {
        dailyRosterEntryId: entryId,
        teamId: "team",
        teamName: "Team A",
        normalVehicleId: "vehicle",
        assignedVehicleId: "vehicle",
        vehicleName: "Truck A",
        normalDepotId: "depot",
        assignedDepotId: "depot",
        depotName: "Depot A",
        entryStatus: "planned",
        availabilityState: "available",
        vehicleIsSubstitution: false,
        depotIsOverride: false,
        substitutionReason: null,
        version: 1,
        updatedAt: "2026-08-20T05:00:00Z",
        staff: [
          {
            staffId: "staff",
            displayName: "Driver A",
            assignmentRole: "driver",
            expectedTeamId: "team",
            isSubstitution: false,
            substitutionReason: null
          }
        ]
      }
    ]
  });
  await page.route("**/api/v1/roster/daily*", (route) =>
    route.fulfill({ json: { ok: true, data: generated ? roster() : null } })
  );
  await page.route("**/api/v1/roster/generate", (route) => {
    generated = true;
    return route.fulfill({ status: 201, json: { ok: true, data: roster() } });
  });
  await page.route("**/api/v1/roster/operational-days/*/validate", (route) =>
    route.fulfill({ json: { ok: true, data: { ready: true, issues: [] } } })
  );
  await page.route("**/api/v1/roster/entries/*", (route) =>
    route.fulfill({ json: { ok: true, data: {} } })
  );
  await page.route("**/api/v1/roster/operational-days/*/transition", async (route) => {
    status = String((await route.request().postDataJSON()).target);
    return route.fulfill({ json: { ok: true, data: roster().operationalDay } });
  });
  await page.getByRole("button", { name: "Daily Roster" }).click();
  await page.getByLabel("Service date").fill("2026-08-20");
  await page.getByRole("button", { name: "Generate roster" }).click();
  await expect(page.getByText("Team A")).toBeVisible();
  await page.getByRole("button", { name: "Edit daily assignment" }).click();
  await page.getByLabel("Substitution / emergency reason").fill("Synthetic cover");
  await page.getByRole("button", { name: "Save assignment" }).click();
  await page.getByRole("button", { name: "Mark Ready" }).click();
  await page.getByRole("button", { name: "Lock roster" }).click();
  await expect(page.getByText("locked", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit daily assignment" })).toHaveCount(0);
});
