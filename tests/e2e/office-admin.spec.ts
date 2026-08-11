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
