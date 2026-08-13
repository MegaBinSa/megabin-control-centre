import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { validateEnvironment } from "../scripts/environment-contract.mjs";
import { ensureSupabaseDataApiSchema } from "../scripts/ensure-supabase-data-api-schema.mjs";
import { inspectSql } from "../scripts/migration-safety.mjs";
import { assertStagingReset } from "../scripts/staging-reset.mjs";
import { runSmoke } from "../scripts/staging-smoke.mjs";

const staging = {
  MEGABIN_ENVIRONMENT: "staging",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable",
  VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable",
  VITE_MASTER_DATA_API_URL:
    "https://abcdefghijklmnopqrst.supabase.co/functions/v1/platform-runtime",
  VITE_DRIVER_API_URL: "https://abcdefghijklmnopqrst.supabase.co/functions/v1/platform-runtime",
  VITE_MEGABIN_ENVIRONMENT: "staging",
  VITE_BUILD_SHA: "abc123",
  VITE_BUILD_TIMESTAMP: "2026-08-13T00:00:00Z",
  VITE_DEPLOYMENT_ID: "synthetic-run",
  MEGABIN_OFFICE_ORIGIN: "https://megabin-office-staging.pages.dev",
  MEGABIN_DRIVER_ORIGIN: "https://megabin-driver-staging.pages.dev",
  MEGABIN_ALLOWED_ORIGINS:
    "https://megabin-office-staging.pages.dev,https://megabin-driver-staging.pages.dev",
  MEGABIN_WEBSITE_ONBOARDING_INTEGRATION_KEY: "megabin-website-onboarding-staging",
  MEGABIN_WEBSITE_ONBOARDING_SECRET: "synthetic-secret",
  MEGABIN_WEBSITE_ONBOARDING_URL:
    "https://abcdefghijklmnopqrst.supabase.co/functions/v1/website-onboarding",
  MEGABIN_COMMUNICATIONS_MODE: "capture",
  MEGABIN_COMMUNICATIONS_TEST_RECIPIENTS: "",
  MEGABIN_COMMUNICATIONS_WEBHOOK_SECRET: "synthetic-webhook",
  MEGABIN_ROUTING_PROVIDER: "fake-routing",
  MEGABIN_OPTIMIZATION_PROVIDER: "fake-optimizer",
  MEGABIN_ACCOUNTING_PROVIDER: "zoho-books-fake",
  MEGABIN_AUTO_FINANCIAL_HOLD: "false",
  MEGABIN_AUTO_FINANCIAL_RELEASE: "false",
  MEGABIN_AUTO_SKIP_REPLAN: "false",
  STAGING_OFFICE_EMAIL: "staging-office@megabin.local",
  STAGING_OFFICE_PASSWORD: "synthetic-password",
  STAGING_DRIVER_EMAIL: "staging-driver@megabin.local",
  STAGING_DRIVER_PASSWORD: "synthetic-password",
  SUPABASE_ACCESS_TOKEN: "synthetic-token",
  SUPABASE_DB_PASSWORD: "synthetic-password",
  CLOUDFLARE_ACCOUNT_ID: "synthetic-account",
  CLOUDFLARE_OFFICE_PROJECT: "megabin-office-staging",
  CLOUDFLARE_DRIVER_PROJECT: "megabin-driver-staging",
  CLOUDFLARE_API_TOKEN: "synthetic-token",
  FRONTEND_DEPLOYMENT_CONFIGURED: "true"
};

describe("staging environment contract", () => {
  it("accepts safe synthetic staging configuration", () => {
    expect(validateEnvironment("staging", staging)).toEqual({ ok: true, errors: [] });
    expect(validateEnvironment("staging", staging, { deployment: true })).toEqual({
      ok: true,
      errors: []
    });
  });

  it("fails closed for missing configuration and unsafe live capabilities", () => {
    const result = validateEnvironment("staging", {
      ...staging,
      SUPABASE_URL: "https://production-project.supabase.co",
      MEGABIN_COMMUNICATIONS_MODE: "live",
      MEGABIN_AUTO_FINANCIAL_HOLD: "true"
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("does not match SUPABASE_PROJECT_REF");
    expect(result.errors.join(" ")).toContain("cannot use live mode");
    expect(result.errors.join(" ")).toContain("must remain false");
  });

  it("rejects an unregistered staging website integration identity", () => {
    const result = validateEnvironment("staging", {
      ...staging,
      MEGABIN_WEBSITE_ONBOARDING_INTEGRATION_KEY: "megabin-website-staging"
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("enabled synthetic integration identity");
  });

  it("refuses production deployment mode", () => {
    const result = validateEnvironment(
      "production",
      { ...staging, MEGABIN_ENVIRONMENT: "production", VITE_MEGABIN_ENVIRONMENT: "production" },
      { deployment: true }
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Production deployment is disabled in Phase 5B.");
  });

  it("rejects a privileged key in browser configuration", () => {
    const result = validateEnvironment("staging", {
      ...staging,
      VITE_SUPABASE_PUBLISHABLE_KEY: "service-role-not-for-browser"
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("privileged secret key");
  });
});

describe("deployment safety tools", () => {
  it("idempotently exposes the application API schema without replacing existing schemas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ db_schema: "public,graphql_public" }))
      .mockResolvedValueOnce(Response.json({ db_schema: "public,graphql_public,api" }))
      .mockResolvedValueOnce(Response.json({ db_schema: "public,graphql_public,api" }));

    await expect(
      ensureSupabaseDataApiSchema(staging, fetchMock as unknown as typeof fetch)
    ).resolves.toEqual({ changed: true, schemas: ["public", "graphql_public", "api"] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ db_schema: "public,graphql_public,api" })
    });
  });

  it("leaves an already compliant hosted Data API contract unchanged", async () => {
    const fetchMock = vi.fn(async () => Response.json({ db_schema: "public,api" }));
    await expect(
      ensureSupabaseDataApiSchema(staging, fetchMock as unknown as typeof fetch)
    ).resolves.toEqual({ changed: false, schemas: ["public", "api"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === "PATCH")).toBe(false);
  });

  it("reconciles the hosted Data API contract before migrations and smoke checks", () => {
    const workflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
    const contract = workflow.indexOf("node scripts/ensure-supabase-data-api-schema.mjs");
    const migrations = workflow.indexOf("supabase db push --linked --dry-run");
    const smoke = workflow.indexOf("pnpm smoke:staging");
    expect(contract).toBeGreaterThan(-1);
    expect(migrations).toBeGreaterThan(contract);
    expect(smoke).toBeGreaterThan(migrations);
  });

  it("uses the repository-pinned Wrangler without workspace mutation fallback", () => {
    const workflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      readonly devDependencies: Readonly<Record<string, string>>;
    };

    expect(packageJson.devDependencies.wrangler).toBe("4.123.0");
    expect(workflow).toContain('test "$(pnpm exec wrangler --version)" = "4.123.0"');
    expect(workflow.match(/packageManager: pnpm/g)).toHaveLength(2);
    expect(workflow).toContain("pages deploy apps/office-web/dist");
    expect(workflow).toContain("pages deploy apps/driver-pwa/dist");
    expect(workflow.match(/--branch=main/g)).toHaveLength(2);
    expect(workflow.match(/--commit-hash=\$\{\{ inputs\.source_sha \}\}/g)).toHaveLength(2);
    expect(workflow).not.toContain("wranglerVersion:");
    expect(workflow).not.toMatch(/pnpm (add|install).*wrangler/);
    expect(workflow).not.toContain("ignore-workspace-root-check");
  });

  it("maps NodeNext JavaScript source specifiers explicitly for both Edge bundlers", () => {
    const sourceRoots = [
      "packages/domain-types/src",
      "packages/integrations/src",
      "packages/route-planning/src",
      "packages/runtime/src"
    ];
    const configurations = [
      "supabase/functions/platform-runtime/deno.json",
      "supabase/functions/website-onboarding/deno.json"
    ];

    for (const configuration of configurations) {
      const deno = JSON.parse(readFileSync(configuration, "utf8")) as {
        readonly imports: Readonly<Record<string, string>>;
        readonly unstable?: readonly string[];
      };
      expect(deno.unstable).toBeUndefined();

      for (const root of sourceRoots) {
        for (const name of readdirSync(root).filter(
          (entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts")
        )) {
          const source = resolve(root, name);
          const text = readFileSync(source, "utf8");
          for (const match of text.matchAll(/["'](\.\/[^"']+\.js)["']/g)) {
            const specifier = match[1];
            if (!specifier) throw new Error(`Unable to read module specifier in ${source}.`);
            const javascript = resolve(dirname(source), specifier);
            const key = relative(dirname(resolve(configuration)), javascript).replaceAll("\\", "/");
            expect(deno.imports[key], `${configuration} must map ${key}`).toBe(
              key.replace(/\.js$/, ".ts")
            );
          }
        }
      }
    }
  });

  it("lints every MegaBin-owned schema without linting platform-managed extensions", () => {
    const workflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
    const scopedLint =
      "supabase db lint --linked --schema app_private,api,public --level warning --fail-on error";

    expect(workflow).toContain(scopedLint);
    expect(workflow).not.toMatch(/supabase db lint --linked --level/);
  });

  it("keeps partial staging deployments safely resumable", () => {
    const workflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
    const preview = workflow.indexOf("supabase db push --linked --dry-run");
    const apply = workflow.indexOf("supabase db push --linked --include-seed");
    const verify = workflow.indexOf(
      "supabase db lint --linked --schema app_private,api,public --level warning --fail-on error"
    );
    const personas = workflow.indexOf("supabase/staging/provision-personas.sql");
    const bundle = workflow.indexOf("deno bundle --config");
    const deploy = workflow.indexOf("supabase functions deploy platform-runtime");

    expect(preview).toBeGreaterThan(-1);
    expect(apply).toBeGreaterThan(preview);
    expect(verify).toBeGreaterThan(apply);
    expect(personas).toBeGreaterThan(verify);
    expect(bundle).toBeGreaterThan(personas);
    expect(deploy).toBeGreaterThan(bundle);
  });

  it("flags destructive migration operations", () => {
    expect(inspectSql("drop table app_private.clients;")).toEqual([
      { file: "migration.sql", kind: "drop_table" }
    ]);
    expect(inspectSql("alter table x enable row level security;")).toEqual([]);
  });

  it("refuses reset outside a project-bound staging confirmation", () => {
    expect(() => assertStagingReset({ MEGABIN_ENVIRONMENT: "production" })).toThrow(
      "must be staging"
    );
    expect(() =>
      assertStagingReset({
        MEGABIN_ENVIRONMENT: "staging",
        SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
        CONFIRM_STAGING_RESET: "wrong"
      })
    ).toThrow("project-bound");
  });

  it("runs non-destructive remote smoke checks", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/v1/token")) return Response.json({ access_token: "synthetic" });
      if (init?.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
      const origin = new Headers(init?.headers).get("Origin");
      if (origin?.includes("unapproved")) return new Response(null, { status: 403 });
      if (url.endsWith("/health/live"))
        return Response.json(
          {
            status: "healthy",
            runtime: { environment: "staging", buildId: "abc123", deploymentId: "synthetic-run" }
          },
          { headers: { "Access-Control-Allow-Origin": "*" } }
        );
      if (url.includes("/master-data/clients") && !init?.headers)
        return new Response(null, { status: 401 });
      if (url.includes("website-onboarding")) return new Response(null, { status: 202 });
      if (url.includes("/accounting/health") || url.includes("/communications/provider-health"))
        return new Response(null, { status: 403 });
      if (url.includes("/accounting/status") && init?.headers)
        return new Response(null, { status: 403 });
      return Response.json({ ok: true });
    });
    const checks = await runSmoke(staging, fetchMock as unknown as typeof fetch);
    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it("reports a failed remote smoke invariant", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/v1/token")) return Response.json({ access_token: "synthetic" });
      if (url === staging.MEGABIN_DRIVER_ORIGIN) return new Response(null, { status: 503 });
      if (init?.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
      const origin = new Headers(init?.headers).get("Origin");
      if (origin?.includes("unapproved")) return new Response(null, { status: 403 });
      if (url.endsWith("/health/live"))
        return Response.json(
          {
            runtime: { environment: "staging", buildId: "abc123", deploymentId: "synthetic-run" }
          },
          { headers: { "Access-Control-Allow-Origin": "*" } }
        );
      if (url.includes("/master-data/clients") && !init?.headers)
        return new Response(null, { status: 401 });
      if (url.includes("website-onboarding")) return new Response(null, { status: 202 });
      if (url.includes("/accounting/health") || url.includes("/communications/provider-health"))
        return new Response(null, { status: 403 });
      if (url.includes("/accounting/status") && init?.headers)
        return new Response(null, { status: 403 });
      return Response.json({ ok: true });
    });
    const checks = await runSmoke(staging, fetchMock as unknown as typeof fetch);
    expect(checks.find((check) => check.name === "driver_frontend")?.passed).toBe(false);
  });
});
