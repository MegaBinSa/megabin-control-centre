import { expect, test, type Page, type Route } from "@playwright/test";

const userId = "10000000-0000-4000-8000-000000000001";
const regionId = "51000000-0000-0000-0000-000000000001";
const token = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ sub: userId, exp: 4102444800 }))}.test`;

const roster = (date: string, lifecycleStatus: "draft" | "locked") => ({
  operationalDay: {
    operationalDayId: `e865a6fc-0d3c-4ef8-90bb-${date.replaceAll("-", "").padEnd(12, "0")}`,
    serviceDate: date,
    serviceRegionId: regionId,
    timezone: "Africa/Johannesburg",
    lifecycleStatus,
    generatedAt: `${date}T05:00:00Z`,
    lockedAt: lifecycleStatus === "locked" ? `${date}T05:30:00Z` : null,
    updatedAt: `${date}T05:30:00Z`
  },
  entries: []
});

async function fulfillApi(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith("/office/profile")) {
    await route.fulfill({
      json: {
        ok: true,
        data: {
          userId,
          displayName: "Synthetic Staging Office",
          permissions: [
            "master_data.read",
            "master_data.write",
            "clients.sensitive.read",
            "roster.read",
            "routes.read",
            "route_operations.read"
          ],
          serviceRegionIds: [regionId]
        }
      }
    });
    return;
  }
  if (url.pathname.endsWith("/master-data/service-regions")) {
    await route.fulfill({
      json: {
        ok: true,
        data: {
          items: [{ serviceRegionId: regionId, name: "Pretoria Test Region" }],
          page: 1,
          pageSize: 25,
          total: 1
        }
      }
    });
    return;
  }
  if (url.pathname.endsWith("/master-data/clients")) {
    await route.fulfill({
      json: {
        ok: true,
        data: {
          items: [
            {
              clientId: "55000000-0000-0000-0000-000000000001",
              displayName: "Synthetic Client One",
              organisationName: null,
              lifecycleStatus: "active",
              updatedAt: "2026-08-21T12:00:00Z"
            }
          ],
          page: 1,
          pageSize: 25,
          total: 1
        }
      }
    });
    return;
  }
  if (url.pathname.endsWith("/roster/daily")) {
    const date = url.searchParams.get("serviceDate") ?? "2026-08-21";
    await route.fulfill({ json: { ok: true, data: roster(date, "locked") } });
    return;
  }
  if (url.pathname.includes("/roster/operational-days/") && url.pathname.endsWith("/validate")) {
    await route.fulfill({ json: { ok: true, data: { ready: true, issues: [] } } });
    return;
  }
  if (url.pathname.endsWith("/route-plans")) {
    await route.fulfill({ json: { ok: true, data: null } });
    return;
  }
  if (url.pathname.endsWith("/route-operations")) {
    await route.fulfill({ json: { ok: true, data: [] } });
    return;
  }
  if (route.request().method() === "GET") {
    await route.fulfill({
      json: { ok: true, data: { items: [], page: 1, pageSize: 25, total: 0 } }
    });
    return;
  }
  await route.fulfill({ json: { ok: true, data: {} } });
}

async function login(page: Page): Promise<void> {
  await page.route("http://supabase.phase1b.test/**", async (route) => {
    await route.fulfill({
      json: route.request().url().includes("/token")
        ? {
            access_token: token,
            refresh_token: "synthetic-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user: { id: userId, aud: "authenticated", role: "authenticated" }
          }
        : { id: userId, aud: "authenticated", role: "authenticated" }
    });
  });
  await page.route("http://api.phase1b.test/**", fulfillApi);
  await page.goto("/");
  await page.getByLabel("Email").fill("staging-office@megabin.local");
  await page.getByLabel("Password").fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
}

test("Office deep links, reload, and History navigation preserve module context", async ({
  page
}) => {
  await login(page);

  await page.getByRole("button", { name: "Daily Roster" }).click();
  await page.getByLabel("Service date").fill("2026-08-24");
  await expect(page).toHaveURL(/module=daily-roster.*date=2026-08-24/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Daily Operational Roster" })).toBeVisible();
  await expect(page.getByLabel("Service date")).toHaveValue("2026-08-24");

  await page.getByRole("button", { name: "Master data" }).click();
  await page.getByRole("button", { name: "Route Planning" }).click();
  await page.getByLabel("Service date").fill("2026-08-24");
  await expect(page).toHaveURL(/module=route-planning.*date=2026-08-24/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Route Planning" })).toBeVisible();
  await expect(page.getByLabel("Service date")).toHaveValue("2026-08-24");

  await page.getByRole("button", { name: "Master data" }).click();
  await page.getByRole("button", { name: "Route Operations" }).click();
  await page.getByLabel("Service date").fill("2026-08-24");
  await expect(page).toHaveURL(/module=route-operations.*date=2026-08-24/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Route Operations" })).toBeVisible();
  await expect(page.getByLabel("Service date")).toHaveValue("2026-08-24");

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Route Operations" })).toBeVisible();

  await page.goto(`/?module=route-planning&region=${regionId}&date=2026-08-24`);
  await expect(page.getByRole("heading", { name: "Route Planning" })).toBeVisible();
  await expect(page.getByLabel("Service date")).toHaveValue("2026-08-24");
});

test("out-of-order roster responses cannot paint the wrong date", async ({ page }) => {
  await login(page);
  let releaseFriday: (() => void) | undefined;
  const fridayReleased = new Promise<void>((resolve) => (releaseFriday = resolve));
  await page.route("**/api/v1/roster/daily*", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("serviceDate") ?? "";
    if (date === "2026-08-21") await fridayReleased;
    await route.fulfill({
      json: { ok: true, data: roster(date, date === "2026-08-21" ? "locked" : "draft") }
    });
  });

  await page.goto(`/?module=daily-roster&region=${regionId}&date=2026-08-21`);
  await page.getByLabel("Service date").fill("2026-08-24");
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();
  releaseFriday?.();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Service date")).toHaveValue("2026-08-24");
});

test("out-of-order route-plan responses and unmounted workspaces cannot repaint Office", async ({
  page
}) => {
  await login(page);
  let releaseFriday: (() => void) | undefined;
  const fridayReleased = new Promise<void>((resolve) => (releaseFriday = resolve));
  await page.route("**/api/v1/route-plans?*", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("serviceDate") ?? "";
    if (date === "2026-08-21") await fridayReleased;
    await route.fulfill({
      json: {
        ok: true,
        data:
          date === "2026-08-21"
            ? {
                routeVersionId: "friday-version",
                routePlanId: "friday-plan",
                versionNumber: 2,
                versionStatus: "published",
                isStale: false,
                updatedAt: "2026-08-21T05:00:00Z",
                routes: [],
                unassignedServices: []
              }
            : null
      }
    });
  });

  await page.goto(`/?module=route-planning&region=${regionId}&date=2026-08-21`);
  await page.getByLabel("Service date").fill("2026-08-24");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText("No route plan exists for this date.")).toBeVisible();
  releaseFriday?.();
  await expect(page.getByText("Version 2")).toHaveCount(0);

  await page.getByRole("button", { name: "Master data" }).click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(page.getByText("Version 2")).toHaveCount(0);
});

test("routine session storage renewal preserves an unsaved editor and sign-out still clears it", async ({
  page
}) => {
  await login(page);
  await page.getByRole("button", { name: "Edit" }).click();
  const patch = page.getByLabel("Editable values (JSON)");
  await patch.fill('{"displayName":"Unsaved Synthetic Name"}');

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith("sb-"));
    if (!key) return;
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        oldValue: localStorage.getItem(key),
        newValue: localStorage.getItem(key)
      })
    );
  });
  await expect(patch).toHaveValue('{"displayName":"Unsaved Synthetic Name"}');
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Office sign in" })).toBeVisible();
});

test("an in-flight Route Operations request cannot repaint a newly selected module", async ({
  page
}) => {
  await login(page);
  let releaseOperations: (() => void) | undefined;
  const released = new Promise<void>((resolve) => (releaseOperations = resolve));
  await page.route("**/api/v1/route-operations?*", async (route) => {
    await released;
    await route.fulfill({ json: { ok: true, data: [] } });
  });

  await page.goto(`/?module=route-operations&region=${regionId}&date=2026-08-24`);
  await expect(page.getByRole("heading", { name: "Route Operations" })).toBeVisible();
  await page.getByRole("button", { name: "Master Data" }).click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  releaseOperations?.();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Route Operations" })).toHaveCount(0);
});

test("failed session restoration clears privileged Office content", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Synthetic Client One")).toBeVisible();
  await page.route("**/api/v1/office/profile", (route) =>
    route.fulfill({
      status: 401,
      json: {
        ok: false,
        error: { code: "unauthorized", message: "Session expired.", correlationId: "test" }
      }
    })
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Office sign in" })).toBeVisible();
  await expect(page.getByText("Synthetic Client One")).toHaveCount(0);
});
