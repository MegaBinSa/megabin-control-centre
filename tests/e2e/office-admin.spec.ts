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

test("Office route planning generate, inspect unassigned work, ready, and publish workflow", async ({
  page
}) => {
  await syntheticSession(page, [
    "master_data.read",
    "routes.read",
    "routes.generate",
    "routes.write",
    "routes.validate",
    "routes.publish"
  ]);
  const regionId = "c2000000-0000-4000-8000-000000000001",
    dayId = "c3000000-0000-4000-8000-000000000001",
    planId = "c4000000-0000-4000-8000-000000000001",
    versionId = "c5000000-0000-4000-8000-000000000001";
  let generated = false;
  let status = "draft";
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
  await page.route("**/api/v1/roster/daily*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          operationalDay: {
            operationalDayId: dayId,
            serviceDate: "2026-08-20",
            serviceRegionId: regionId,
            timezone: "Africa/Johannesburg",
            lifecycleStatus: "locked",
            generatedAt: "2026-08-20T05:00:00Z",
            lockedAt: "2026-08-20T05:10:00Z",
            updatedAt: "2026-08-20T05:10:00Z"
          },
          entries: []
        }
      }
    })
  );
  const plan = () => ({
    routeVersionId: versionId,
    routePlanId: planId,
    versionNumber: 1,
    versionStatus: status,
    isStale: false,
    updatedAt: `2026-08-20T05:${status.length}:00Z`,
    routes: [
      {
        plannedRouteId: "route",
        teamId: "team",
        teamName: "Team A",
        vehicleId: "vehicle",
        vehicleName: "Truck A",
        vehicleCapacityUnits: 20,
        plannedCapacityUnits: 3,
        plannedDurationMinutes: 15,
        usableWindowMinutes: 480,
        stops: [
          {
            plannedRouteStopId: "stop",
            clientServiceId: "service",
            sequenceNumber: 1,
            drumUnits: 3,
            latitude: -25.75,
            longitude: 28.2,
            addressSnapshot: { line1: "10 Route Street" }
          }
        ]
      }
    ],
    unassignedServices: [
      {
        unassignedRouteServiceId: "u",
        clientServiceId: "missing",
        reasonCode: "missing_coordinates",
        remediation: "Geocode and validate the service address."
      }
    ]
  });
  await page.route("**/api/v1/route-plans?*", (route) =>
    route.fulfill({ json: { ok: true, data: generated ? plan() : null } })
  );
  await page.route("**/api/v1/route-plans/generate", (route) => {
    generated = true;
    return route.fulfill({ status: 201, json: { ok: true, data: plan() } });
  });
  await page.route("**/api/v1/route-versions/*/validate", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: { valid: true, issues: [{ code: "unassigned_services", blocking: false }] }
      }
    })
  );
  await page.route("**/api/v1/route-versions/*/ready", (route) => {
    status = "ready";
    return route.fulfill({ json: { ok: true, data: plan() } });
  });
  await page.route("**/api/v1/route-versions/*/publish", (route) => {
    status = "published";
    return route.fulfill({ json: { ok: true, data: plan() } });
  });
  await page.getByRole("button", { name: "Route Planning" }).click();
  await page.getByLabel("Service date").fill("2026-08-20");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByText("Team A")).toBeVisible();
  await expect(page.getByText("missing_coordinates")).toBeVisible();
  await expect(page.getByLabel("Schematic route geography")).toBeVisible();
  await page.getByRole("button", { name: "Mark Ready" }).click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("published", { exact: true })).toBeVisible();
});

test("Office route optimization compares and accepts a candidate", async ({ page }) => {
  await syntheticSession(page, [
    "master_data.read",
    "routes.read",
    "routes.write",
    "routes.optimize",
    "routes.optimization.read",
    "routes.optimization.apply"
  ]);
  const regionId = "d2000000-0000-4000-8000-000000000001";
  let version = 1;
  const plan = () => ({
    routeVersionId:
      version === 1
        ? "d3000000-0000-4000-8000-000000000001"
        : "d3000000-0000-4000-8000-000000000002",
    routePlanId: "d4000000-0000-4000-8000-000000000001",
    versionNumber: version,
    versionStatus: "draft",
    generationMethod: version === 1 ? "deterministic_baseline" : "provider_optimized",
    isStale: false,
    updatedAt: "2026-08-12T06:00:00Z",
    routes: [],
    unassignedServices: []
  });
  await page.route("**/api/v1/master-data/service-regions*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          items: [{ serviceRegionId: regionId, name: "Region" }],
          page: 1,
          pageSize: 25,
          total: 1
        }
      }
    })
  );
  await page.route("**/api/v1/roster/daily*", (route) =>
    route.fulfill({ json: { ok: true, data: null } })
  );
  await page.route("**/api/v1/route-providers/health*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: [
          { providerKey: "fake-optimizer", capability: "optimization", healthStatus: "healthy" }
        ]
      }
    })
  );
  await page.route("**/api/v1/route-plans?*", (route) =>
    route.fulfill({ json: { ok: true, data: plan() } })
  );
  await page.route("**/api/v1/route-optimizations", (route) =>
    route.fulfill({
      status: 202,
      json: {
        ok: true,
        data: {
          routeOptimizationAttemptId: "d5000000-0000-4000-8000-000000000001",
          sourceRouteVersionId: plan().routeVersionId,
          candidateRouteVersionId: null,
          lifecycleStatus: "succeeded",
          routingProvider: "fake-routing",
          optimizationProvider: "fake-optimizer",
          comparison: {
            baselineDistanceMetres: 1000,
            candidateDistanceMetres: 800,
            baselineDurationMinutes: 50,
            candidateDurationMinutes: 45
          },
          providerWarnings: [],
          candidateResult: {
            routes: [
              {
                routeId: "route",
                stopIds: ["stop"],
                geometry: {
                  format: "geojson_linestring",
                  coordinates: [
                    [28.2, -25.75],
                    [28.22, -25.76]
                  ],
                  source: "provider_road"
                }
              }
            ],
            unassignedStopIds: []
          },
          failureClassification: null,
          failureSummary: null
        }
      }
    })
  );
  await page.route("**/api/v1/route-optimizations/*/accept", (route) => {
    version = 2;
    return route.fulfill({ json: { ok: true, data: plan() } });
  });
  await page.getByRole("button", { name: "Route Planning" }).click();
  await expect(page.getByText("Optimization provider:")).toContainText("healthy");
  await page.getByRole("button", { name: "Optimize" }).click();
  await expect(page.getByRole("heading", { name: "Optimization candidate" })).toBeVisible();
  await expect(page.getByText("Candidate 800 m")).toBeVisible();
  await expect(page.getByLabel("Optimized candidate road route")).toBeVisible();
  await page.getByRole("button", { name: "Accept candidate" }).click();
  await expect(page.getByText("Version 2")).toBeVisible();
  await expect(page.getByText("Strategy: provider optimized")).toBeVisible();
});

test("Office Route Operations hands off and reassigns a published route", async ({ page }) => {
  await syntheticSession(page, [
    "master_data.read",
    "route_operations.read",
    "route_operations.create",
    "route_operations.reassign"
  ]);
  const regionId = "f2000000-0000-4000-8000-000000000001";
  const operationId = "f3000000-0000-4000-8000-000000000001";
  let handedOff = false;
  let revision = 1;
  const operations = () =>
    handedOff
      ? [
          {
            routeOperationId: operationId,
            lifecycleStatus: "available",
            assignmentRevision: revision,
            manifestRevision: revision,
            currentTeamId: "team-a",
            currentVehicleId: "vehicle-a",
            acceptedAt: null,
            startedAt: null,
            manifest: {
              team: { name: "Team A" },
              vehicle: { displayName: "Truck A" },
              staff: [{ displayName: "Driver A" }]
            }
          }
        ]
      : [];
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
  await page.route("**/api/v1/route-operations?*", (route) =>
    route.fulfill({ json: { ok: true, data: operations() } })
  );
  await page.route(`**/api/v1/route-operations/${operationId}/execution`, (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          progress: {
            completedStops: 1,
            notServicedStops: 1,
            remainingStops: 2,
            totalStops: 4,
            plannedDrums: 8,
            actualDrumsServiced: 2,
            openIssueCount: 1,
            capacityState: "normal"
          },
          stops: []
        }
      }
    })
  );
  await page.route("**/api/v1/route-operations/handoff", (route) => {
    handedOff = true;
    return route.fulfill({ status: 201, json: { ok: true, data: { operations: operations() } } });
  });
  await page.route(`**/api/v1/route-operations/${operationId}/reassign`, (route) => {
    revision = 2;
    return route.fulfill({ json: { ok: true, data: operations()[0] } });
  });
  await page.getByRole("button", { name: "Route Operations" }).click();
  await page.getByLabel("Service date").fill("2026-08-20");
  await page.getByLabel("Published Route Version ID").fill("f4000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "Hand off published route" }).click();
  await expect(page.getByText("Team A")).toBeVisible();
  await expect(page.getByText("2/4 stops")).toBeVisible();
  await page.getByRole("button", { name: "Reassign" }).click();
  await page.getByLabel("Staff IDs (comma separated)").fill("f5000000-0000-4000-8000-000000000001");
  await page.getByLabel("Reason").fill("Synthetic operational cover");
  await page.getByRole("button", { name: "Save reassignment" }).click();
  await expect(page.getByText("Assignment revision 2")).toBeVisible();
});

test("future Driver browser API harness reads, accepts, and starts its operation", async ({
  page
}) => {
  const operationId = "f6000000-0000-4000-8000-000000000001";
  const requests: string[] = [];
  await page.route("https://driver.phase2c.test/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(`${route.request().method()} ${path}`);
    if (path.endsWith("/manifest"))
      return route.fulfill({
        json: {
          ok: true,
          data: { routeOperationId: operationId, manifestRevision: 1, stops: [] }
        }
      });
    return route.fulfill({
      json: {
        ok: true,
        data: { actionId: crypto.randomUUID(), outcome: "accepted" }
      }
    });
  });
  await page.goto("about:blank");
  const results = await page.evaluate(async (id) => {
    let sequenceId = 0;
    const uuid = () => `f7000000-0000-4000-8000-${String(++sequenceId).padStart(12, "0")}`;
    const manifest = await fetch(
      `https://driver.phase2c.test/api/v1/driver/route-operations/${id}/manifest`
    ).then((response) => response.json());
    const act = async (actionType: string, sequence: number) => {
      const key = uuid();
      return fetch(`https://driver.phase2c.test/api/v1/driver/route-operations/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({
          actionId: uuid(),
          routeOperationId: id,
          assignmentRevision: 1,
          deviceTimestamp: new Date().toISOString(),
          clientSequence: sequence,
          idempotencyKey: key,
          correlationId: uuid(),
          actionType,
          payloadVersion: 1,
          payload: {}
        })
      }).then((response) => response.json());
    };
    return { manifest, accepted: await act("accept", 1), started: await act("start", 2) };
  }, operationId);
  expect(results.manifest.data.routeOperationId).toBe(operationId);
  expect(results.accepted.data.outcome).toBe("accepted");
  expect(results.started.data.outcome).toBe("accepted");
  expect(requests).toEqual([
    `GET /api/v1/driver/route-operations/${operationId}/manifest`,
    `POST /api/v1/driver/route-operations/${operationId}/actions`,
    `POST /api/v1/driver/route-operations/${operationId}/actions`
  ]);
});

test("Office Live Vehicles shows regional map, status, and device administration", async ({
  page
}) => {
  await syntheticSession(page, [
    "master_data.read",
    "vehicle_tracking.read",
    "vehicle_tracking.health.read",
    "vehicle_tracking.manage_devices",
    "vehicle_tracking.assign_devices"
  ]);
  const regionId = "81000000-0000-4000-8000-000000000001";
  await page.route("**/api/v1/master-data/service-regions*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          items: [{ serviceRegionId: regionId, name: "Tracking North" }],
          page: 1,
          pageSize: 25,
          total: 1
        }
      }
    })
  );
  await page.route("**/api/v1/vehicle-tracking/positions?*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: [
          {
            vehicleId: "82000000-0000-4000-8000-000000000001",
            vehicleDisplayName: "Truck Track",
            registrationReference: "TRACK-1",
            deviceId: "83000000-0000-4000-8000-000000000001",
            deviceName: "Driver Phone",
            deviceStatus: "active",
            teamName: "Team Tracking",
            routeOperationId: "84000000-0000-4000-8000-000000000001",
            latitude: -25.7479,
            longitude: 28.2293,
            recordedAt: new Date().toISOString(),
            ageSeconds: 12,
            accuracyMetres: 10,
            health: "healthy"
          }
        ]
      }
    })
  );
  await page.route("**/api/v1/vehicle-tracking/devices?*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: [
          {
            vehicleTrackingDeviceId: "83000000-0000-4000-8000-000000000001",
            deviceName: "Driver Phone",
            deviceReference: "PWA-1",
            lifecycleStatus: "active",
            vehicleDisplayName: "Truck Track",
            lastSeenAt: new Date().toISOString()
          }
        ]
      }
    })
  );
  await page.getByRole("button", { name: "Live Vehicles" }).click();
  await expect(page.getByRole("heading", { name: "Live Vehicles" })).toBeVisible();
  await expect(page.getByText("Team Tracking")).toBeVisible();
  await expect(page.getByText("Truck Track", { exact: true }).first()).toBeVisible();
  await page.locator(".vehicle-marker").click();
  await expect(page.getByText("accuracy 10 m")).toBeVisible();
  await expect(page.getByRole("button", { name: "Register device" })).toBeVisible();
});

test("Office Live Operations reviews and dismisses inferred facts", async ({ page }) => {
  await syntheticSession(page, [
    "master_data.read",
    "live_operations.read",
    "operational_intelligence.read",
    "operational_intelligence.review",
    "needs_attention.read"
  ]);
  const regionId = "91000000-0000-4000-8000-000000000001";
  const operationId = "92000000-0000-4000-8000-000000000001";
  const factId = "93000000-0000-4000-8000-000000000001";
  await page.route("**/api/v1/master-data/service-regions*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          items: [{ serviceRegionId: regionId, name: "Live North" }],
          page: 1,
          pageSize: 25,
          total: 1
        }
      }
    })
  );
  await page.route("**/api/v1/live-operations?*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          openNeedsAttention: 1,
          routes: [
            {
              routeOperationId: operationId,
              vehicleId: "94000000-0000-4000-8000-000000000001",
              vehicleName: "Truck Live",
              registrationReference: "LIVE-1",
              teamName: "Team Live",
              routeStatus: "in_progress",
              currentInterpretation: "between_stops",
              authoritativeCompletedStops: 2,
              inferredVisitedStops: 1,
              remainingStops: 3,
              scheduleRisk: "at_risk",
              trackingHealth: "healthy",
              openFactCount: 1,
              position: {
                latitude: -25.75,
                longitude: 28.24,
                recordedAt: new Date().toISOString(),
                accuracyMetres: 12
              }
            }
          ]
        }
      }
    })
  );
  await page.route("**/api/v1/operational-intelligence/facts?*", (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: [
          {
            operationalFactId: factId,
            factType: "route_deviation",
            vehicleName: "Truck Live",
            teamName: "Team Live",
            routeOperationId: operationId,
            severity: "warning",
            confidence: "high",
            lifecycleStatus: "open",
            detectedAt: new Date().toISOString(),
            summary: "Sustained route corridor deviation",
            evidence: { consecutiveObservations: 3 }
          }
        ]
      }
    })
  );
  await page.route("**/api/v1/needs-attention?*", (route) =>
    route.fulfill({
      json: { ok: true, data: [{ needsAttentionItemId: "95000000-0000-4000-8000-000000000001" }] }
    })
  );
  await page.route(`**/api/v1/operational-intelligence/facts/${factId}/dismiss`, (route) =>
    route.fulfill({
      json: { ok: true, data: { operationalFactId: factId, lifecycleStatus: "dismissed" } }
    })
  );
  await page.getByRole("button", { name: "Live Operations" }).click();
  await expect(page.getByRole("heading", { name: "Live Operations" })).toBeVisible();
  await expect(page.getByText("Team Live").first()).toBeVisible();
  await expect(page.getByText("Sustained route corridor deviation")).toBeVisible();
  await page.locator(".vehicle-marker").click();
  await expect(page.getByText("2 authoritative, 1 inferred, 3 remaining")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("Synthetic false positive"));
  const request = page.waitForRequest((candidate) =>
    candidate.url().endsWith(`/operational-intelligence/facts/${factId}/dismiss`)
  );
  await page.getByRole("button", { name: "Dismiss false positive" }).click();
  expect((await request).postDataJSON()).toEqual({ reason: "Synthetic false positive" });
});
