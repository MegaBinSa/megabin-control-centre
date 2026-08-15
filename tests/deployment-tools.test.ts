import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  configuredOrigins,
  withApprovedCors
} from "../supabase/functions/_shared/cors";
import { validateEnvironment } from "../scripts/environment-contract.mjs";
import { ensureSupabaseDataApiSchema } from "../scripts/ensure-supabase-data-api-schema.mjs";
import { inspectSql } from "../scripts/migration-safety.mjs";
import { buildMonitoringEvidence } from "../scripts/operational-monitor.mjs";
import { validateReadinessGates } from "../scripts/readiness-gates.mjs";
import { assertRestoreRehearsal } from "../scripts/recovery-contract.mjs";
import { buildRecoveryEvidence } from "../scripts/recovery-evidence.mjs";
import { createRollbackPlan } from "../scripts/rollback-rehearsal.mjs";
import { assertStagingReset } from "../scripts/staging-reset.mjs";
import { runSmoke } from "../scripts/staging-smoke.mjs";
import { validateUatCatalogue } from "../scripts/uat-contract.mjs";
import { assertUatDataOperation } from "../scripts/uat-data-contract.mjs";

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

function browserCorsHeaders(init?: RequestInit): Record<string, string> {
  const origin = new Headers(init?.headers).get("Origin");
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS.join(", "),
        "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS.join(", ")
      }
    : {};
}

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

  it("imports migration safety from inline ESM without a CLI entry argument", () => {
    const moduleUrl = pathToFileURL(resolve("scripts/migration-safety.mjs")).href;
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { inspectSql } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(inspectSql("drop table app_private.clients;")));`
      ],
      { encoding: "utf8" }
    );

    expect(JSON.parse(output)).toEqual([{ file: "migration.sql", kind: "drop_table" }]);
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
          headers: browserCorsHeaders(init)
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
          { headers: browserCorsHeaders(init) }
        );
      if (url.includes("/master-data/clients") && !init?.headers)
        return new Response(null, { status: 401 });
      if (url.includes("website-onboarding"))
        return new Response(null, { status: init?.method === "POST" ? 202 : 404 });
      if (url.includes("/accounting/health") || url.includes("/communications/provider-health"))
        return new Response(null, { status: 403 });
      if (url.includes("/accounting/status") && init?.headers)
        return new Response(null, { status: 403 });
      return Response.json({ ok: true }, { headers: browserCorsHeaders(init) });
    });
    const checks = await runSmoke(staging, fetchMock as unknown as typeof fetch);
    expect(checks.every((check) => check.passed)).toBe(true);
    expect(checks.find((check) => check.name === "regional_office_master_data_read")?.passed).toBe(
      true
    );
    expect(
      fetchMock.mock.calls.some((call) => {
        const url = new URL(String(call[0]));
        return (
          url.pathname.endsWith("/master-data/clients") &&
          url.searchParams.get("serviceRegionId") === "51000000-0000-0000-0000-000000000001"
        );
      })
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]).includes("website-onboarding") && call[1]?.method === "POST"
      )
    ).toBe(false);
  });

  it("reports a failed remote smoke invariant", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/v1/token")) return Response.json({ access_token: "synthetic" });
      if (url === staging.MEGABIN_DRIVER_ORIGIN) return new Response(null, { status: 503 });
      if (init?.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: browserCorsHeaders(init)
        });
      }
      const origin = new Headers(init?.headers).get("Origin");
      if (origin?.includes("unapproved")) return new Response(null, { status: 403 });
      if (url.endsWith("/health/live"))
        return Response.json(
          {
            runtime: { environment: "staging", buildId: "abc123", deploymentId: "synthetic-run" }
          },
          { headers: browserCorsHeaders(init) }
        );
      if (url.includes("/master-data/clients") && !init?.headers)
        return new Response(null, { status: 401 });
      if (url.includes("website-onboarding"))
        return new Response(null, { status: init?.method === "POST" ? 202 : 404 });
      if (url.includes("/accounting/health") || url.includes("/communications/provider-health"))
        return new Response(null, { status: 403 });
      if (url.includes("/accounting/status") && init?.headers)
        return new Response(null, { status: 403 });
      return Response.json({ ok: true }, { headers: browserCorsHeaders(init) });
    });
    const checks = await runSmoke(staging, fetchMock as unknown as typeof fetch);
    expect(checks.find((check) => check.name === "driver_frontend")?.passed).toBe(false);
  });

  it("fails smoke when the region-scoped Office Clients read is denied", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/v1/token")) return Response.json({ access_token: "synthetic" });
      if (init?.method === "OPTIONS")
        return new Response(null, { status: 204, headers: browserCorsHeaders(init) });
      if (new Headers(init?.headers).get("Origin")?.includes("unapproved"))
        return new Response(null, { status: 403 });
      if (url.endsWith("/health/live"))
        return Response.json(
          {
            runtime: {
              environment: "staging",
              buildId: "abc123",
              deploymentId: "synthetic-run"
            }
          },
          { headers: browserCorsHeaders(init) }
        );
      if (url.includes("/master-data/clients"))
        return new Response(null, {
          status: init?.headers ? 403 : 401,
          headers: browserCorsHeaders(init)
        });
      if (url.includes("website-onboarding")) return new Response(null, { status: 404 });
      if (url.includes("/accounting/health") || url.includes("/communications/provider-health"))
        return new Response(null, { status: 403 });
      if (url.includes("/accounting/status")) return new Response(null, { status: 403 });
      return Response.json({ ok: true }, { headers: browserCorsHeaders(init) });
    });

    const checks = await runSmoke(staging, fetchMock as unknown as typeof fetch);
    expect(checks.find((check) => check.name === "authenticated_office")?.passed).toBe(true);
    expect(checks.find((check) => check.name === "regional_office_master_data_read")?.passed).toBe(
      false
    );
  });

  it("fails smoke when a generic preflight omits browser API headers", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/v1/token")) return Response.json({ access_token: "synthetic" });
      if (init?.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": new Headers(init.headers).get("Origin") ?? "",
            "Access-Control-Allow-Headers": "authorization, content-type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
          }
        });
      if (new Headers(init?.headers).get("Origin")?.includes("unapproved"))
        return new Response(null, { status: 403 });
      if (url.endsWith("/health/live"))
        return Response.json(
          {
            runtime: { environment: "staging", buildId: "abc123", deploymentId: "synthetic-run" }
          },
          { headers: browserCorsHeaders(init) }
        );
      if (url.includes("/master-data/clients") && !init?.headers)
        return new Response(null, { status: 401 });
      if (url.includes("website-onboarding")) return new Response(null, { status: 404 });
      if (url.includes("/accounting/health") || url.includes("/communications/provider-health"))
        return new Response(null, { status: 403 });
      if (url.includes("/accounting/status")) return new Response(null, { status: 403 });
      return Response.json({ ok: true }, { headers: browserCorsHeaders(init) });
    });

    const checks = await runSmoke(staging, fetchMock as unknown as typeof fetch);
    expect(checks.find((check) => check.name === "office_profile_cors_contract")?.passed).toBe(
      false
    );
    expect(checks.find((check) => check.name === "driver_bootstrap_cors_contract")?.passed).toBe(
      false
    );
  });

  it("keeps authenticated browser CORS under the exact approved-origin boundary", async () => {
    const origin = staging.MEGABIN_OFFICE_ORIGIN;
    const request = new Request(`${staging.VITE_MASTER_DATA_API_URL}/api/v1/office/profile`, {
      headers: { Origin: origin }
    });
    const response = withApprovedCors(request, Response.json({ ok: true }), [origin]);

    expect(configuredOrigins(`${origin}, ${staging.MEGABIN_DRIVER_ORIGIN}`)).toEqual([
      origin,
      staging.MEGABIN_DRIVER_ORIGIN
    ]);
    expect(() => configuredOrigins("*")).toThrow("Wildcard CORS is forbidden");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("x-correlation-id");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("idempotency-key");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");

    const runtimeSource = readFileSync("supabase/functions/platform-runtime/index.ts", "utf8");
    expect(runtimeSource).toContain('{ auth: "user", cors: "disabled" }');
    expect(runtimeSource).toContain("await authenticatedFetch(request)");
  });

  it("creates stable deduplicated monitoring evidence with approved ownership", () => {
    const definition = JSON.parse(readFileSync("config/operational-alerts.json", "utf8"));
    const evidence = buildMonitoringEvidence(
      staging,
      [{ name: "runtime_liveness", passed: false, status: 503 }],
      definition,
      new Date("2026-08-15T00:00:00Z")
    );
    expect(evidence.outcome).toBe("Failed");
    expect(evidence.alerts.find((alert) => alert.alertId === "MBA-STG-API-001")).toMatchObject({
      alertId: "MBA-STG-API-001",
      deduplicationKey: "staging:MBA-STG-API-001",
      owner: "Shaun",
      deliveryDestination: "github-actions-email",
      state: "Open"
    });
  });

  it("retains non-mutating monitor evidence and requires human delivery confirmation", () => {
    const workflow = readFileSync(".github/workflows/monitor-staging.yml", "utf8");
    expect(workflow).toContain("pnpm monitor:staging");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("Alert destination: GitHub Actions workflow notification email");
    expect(workflow).toContain("PROVE-ALERT-DELIVERY:MBA-STG-MON-TEST-001");
    expect(workflow).toContain("vars.WEBSITE_ONBOARDING_INTEGRATION_KEY");
    expect(workflow).toContain("secrets.WEBSITE_ONBOARDING_SECRET");
    expect(workflow).not.toContain("MEGABIN_SMOKE_ALLOW_MUTATION");
    expect(readFileSync(".github/workflows/deploy-staging.yml", "utf8")).toContain(
      'MEGABIN_SMOKE_ALLOW_MUTATION: "true"'
    );
  });

  it("fails restore rehearsal closed outside the exact approved source and target", () => {
    const objectives = JSON.parse(readFileSync("config/recovery-objectives.json", "utf8"));
    expect(() => assertRestoreRehearsal({}, objectives)).toThrow("restore-rehearsal");
    expect(() =>
      assertRestoreRehearsal(
        {
          MEGABIN_ENVIRONMENT: "restore-rehearsal",
          SOURCE_SUPABASE_PROJECT_REF: objectives.sourceProjectRef,
          RESTORE_SUPABASE_PROJECT_REF: objectives.sourceProjectRef
        },
        objectives
      )
    ).toThrow("isolated");
    expect(
      assertRestoreRehearsal(
        {
          MEGABIN_ENVIRONMENT: "restore-rehearsal",
          SOURCE_SUPABASE_PROJECT_REF: objectives.sourceProjectRef,
          STAGING_SUPABASE_PROJECT_REF: objectives.sourceProjectRef,
          RESTORE_SUPABASE_PROJECT_REF: objectives.restoreTargetProjectRef,
          CONFIRM_RESTORE_REHEARSAL: `RESTORE-REHEARSAL:${objectives.sourceProjectRef}:${objectives.restoreTargetProjectRef}`,
          RECOVERY_POINT: "2026-08-15T12:00:00Z"
        },
        objectives
      )
    ).toMatchObject({
      targetRpo: "PT1H",
      achievedRpo: null,
      rpoStatus: "NOT_ACHIEVED",
      targetRto: "PT4H",
      managedBackup: false,
      pitr: false
    });
  });

  it("records observed restore time without converting the unmet RPO into success", () => {
    const objectives = JSON.parse(readFileSync("config/recovery-objectives.json", "utf8"));
    expect(
      buildRecoveryEvidence(
        {
          RECOVERY_POINT: "2026-08-15T12:00:00Z",
          DUMP_CREATED_AT: "2026-08-15T12:01:00Z",
          RESTORE_STARTED_AT: "2026-08-15T12:02:00Z",
          RESTORE_COMPLETED_AT: "2026-08-15T12:32:00Z",
          RESTORE_RESULT: "Passed",
          GITHUB_ACTOR: "synthetic-operator",
          INTEGRITY_CHECKS: "schema,authorization"
        },
        objectives
      )
    ).toMatchObject({
      elapsedSeconds: 1800,
      observedRtoMet: true,
      achievedRpo: null,
      rpoStatus: "NOT_ACHIEVED",
      verificationStatus: "PENDING_INDEPENDENT_CONFIRMATION"
    });
  });

  it("keeps logical dumps private and recovery refs immutable in the protected workflow", () => {
    const workflow = readFileSync(".github/workflows/rehearse-staging-recovery.yml", "utf8");
    const preparation = readFileSync("supabase/recovery/prepare-disposable-target.sql", "utf8");
    expect(workflow).toContain("environment: staging-recovery");
    expect(workflow).toContain("pnpm recovery:validate");
    expect(workflow).toContain("supabase/recovery/verify-disposable-target.sql");
    expect(workflow).toContain("supabase/recovery/prepare-disposable-target.sql");
    expect(workflow).toContain("supabase/recovery/verify-restored-target.sql");
    expect(workflow).toContain("retention-days: 90");
    expect(workflow).not.toMatch(/path:\s*\$?RECOVERY_WORK/);
    expect(workflow).not.toContain("restore-pitr");
    expect(workflow).not.toContain("db reset");
    expect(preparation).toContain("drop schema if exists supabase_migrations cascade;");
    expect(preparation).not.toContain("truncate table supabase_migrations.schema_migrations");
    expect(preparation).toContain("create extension if not exists postgis with schema extensions;");
  });

  it("restores the real migration schema before history and loads circular data atomically", () => {
    const workflow = readFileSync(".github/workflows/rehearse-staging-recovery.yml", "utf8");
    const migrationSchemaDump =
      'supabase db dump --linked --schema supabase_migrations --file "$work/migration-schema.sql"';
    expect(workflow).toContain(migrationSchemaDump);
    expect(workflow).toContain("SUPABASE_RECOVERY_DB_URL: ${{ secrets.SUPABASE_RECOVERY_DB_URL }}");
    expect(workflow).toContain('test -n "$SUPABASE_RECOVERY_DB_URL"');
    expect(workflow).toContain("psql --version");
    expect(workflow).toContain('psql "$SUPABASE_RECOVERY_DB_URL"');
    expect(workflow).toContain("--single-transaction");
    expect(workflow).toContain("--set ON_ERROR_STOP=1");
    expect(workflow).toContain('--command "set session_replication_role = replica;"');
    expect(workflow).toContain('--command "set session_replication_role = origin;"');
    expect(workflow.indexOf('--file "$RECOVERY_WORK/migration-schema.sql"')).toBeLessThan(
      workflow.indexOf('--file "$RECOVERY_WORK/migration-data.sql"')
    );
    expect(workflow.indexOf('--command "set session_replication_role = replica;"')).toBeLessThan(
      workflow.indexOf('--file "$RECOVERY_WORK/auth-data.sql"')
    );
    expect(workflow.match(/--command "set session_replication_role = replica;"/g)).toHaveLength(3);
    expect(workflow.indexOf('--file "$RECOVERY_WORK/application-data.sql"')).toBeLessThan(
      workflow.indexOf('--file "$RECOVERY_WORK/migration-data.sql"')
    );
    expect(workflow).toContain('*"$RESTORE_SUPABASE_PROJECT_REF"*');
    expect(workflow).toContain('*"$SOURCE_SUPABASE_PROJECT_REF"*');
    expect(workflow).not.toContain('supabase db query --linked --file "$RECOVERY_WORK/schema.sql"');
  });

  it("verifies the recovered Office permission against the provisioned staging region", () => {
    const workflow = readFileSync(".github/workflows/rehearse-staging-recovery.yml", "utf8");
    const recoveryVerification = readFileSync(
      "supabase/recovery/verify-restored-target.sql",
      "utf8"
    );
    const disposableMarker = readFileSync("supabase/recovery/mark-disposable-target.sql", "utf8");
    const stagingVerification = readFileSync("supabase/staging/verify-personas.sql", "utf8");
    const personaProvisioning = readFileSync(
      "supabase/migrations/20260813164331_staging_persona_provisioning.sql",
      "utf8"
    );
    const stagingRegion = "51000000-0000-0000-0000-000000000001";

    expect(recoveryVerification).toContain(`synthetic_region constant uuid := '${stagingRegion}'`);
    expect(stagingVerification).toContain(`synthetic_region constant uuid := '${stagingRegion}'`);
    expect(personaProvisioning).toContain(`v_region_id constant uuid := '${stagingRegion}'`);
    expect(recoveryVerification).not.toContain("10000000-0000-0000-0000-000000000001");
    expect(recoveryVerification).not.toContain("insert into recovery_control.target_state");
    expect(disposableMarker).toContain("insert into recovery_control.target_state");
    expect(disposableMarker).toContain("'ivtaoqorcryzsempsogs'");
    expect(disposableMarker).toContain("'xniweqdmswzljcgkfglx'");

    const reclaimVerification = workflow.indexOf("supabase/recovery/verify-restored-target.sql");
    const reclaimMigrationDiff = workflow.indexOf(
      'diff -u "$RECOVERY_WORK/source-migrations.txt" "$RECOVERY_WORK/prior-restored-migrations.txt"'
    );
    const firstDisposableMark = workflow.indexOf("supabase/recovery/mark-disposable-target.sql");
    expect(reclaimVerification).toBeGreaterThan(-1);
    expect(reclaimMigrationDiff).toBeGreaterThan(reclaimVerification);
    expect(firstDisposableMark).toBeGreaterThan(reclaimMigrationDiff);
  });

  it("authenticates the protected source runtime health request with the staging Office persona", () => {
    const workflow = readFileSync(".github/workflows/rehearse-staging-recovery.yml", "utf8");
    expect(workflow).toContain(
      "SUPABASE_STAGING_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_STAGING_PUBLISHABLE_KEY }}"
    );
    expect(workflow).toContain("STAGING_OFFICE_EMAIL: ${{ vars.STAGING_OFFICE_EMAIL }}");
    expect(workflow).toContain("STAGING_OFFICE_PASSWORD: ${{ secrets.STAGING_OFFICE_PASSWORD }}");
    expect(workflow).toContain('test -n "$SUPABASE_STAGING_PUBLISHABLE_KEY"');
    expect(workflow).toContain('test -n "$STAGING_OFFICE_EMAIL"');
    expect(workflow).toContain('test -n "$STAGING_OFFICE_PASSWORD"');
    expect(workflow).toContain("/auth/v1/token?grant_type=password");
    expect(workflow).toContain('--header "Authorization: Bearer ${source_access_token}"');
    expect(workflow).toContain("/functions/v1/platform-runtime/api/v1/health/live");
    expect(workflow).not.toContain("/functions/v1/platform-runtime/health/live");
  });

  it("restores current Staging after a compatible component rollback rehearsal", () => {
    const workflow = readFileSync(".github/workflows/rehearse-staging-rollback.yml", "utf8");
    expect(workflow).toContain("pnpm rollback:plan");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain(
      "git fetch --no-tags --prune origin +refs/heads/main:refs/remotes/origin/main"
    );
    expect(workflow).toContain('git cat-file -e "${PRIOR_RELEASE_SHA}^{commit}"');
    expect(workflow).toContain('git cat-file -e "${CURRENT_RELEASE_SHA}^{commit}"');
    expect(workflow).toContain('test "$(git rev-parse origin/main)" = "$CURRENT_RELEASE_SHA"');
    expect(workflow).toContain('git merge-base --is-ancestor "$PRIOR_RELEASE_SHA" origin/main');
    expect(workflow).toContain("deploy-prior-compatible-release");
    expect(workflow).toContain("restore-current-release");
    expect(workflow).toContain("allow_destructive_migrations: false");
    expect(workflow).not.toContain("migration down");
    expect(workflow).not.toContain("db reset");
  });

  it("requires full history before an older immutable release can pass ancestry validation", () => {
    const root = mkdtempSync(join(tmpdir(), "megabin-rollback-history-"));
    const origin = join(root, "origin.git");
    const source = join(root, "source");
    const shallow = join(root, "shallow");
    const git = (args: string[], cwd = root) =>
      execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

    try {
      mkdirSync(source);
      git(["init", "--bare", origin]);
      git(["init"], source);
      git(["config", "user.name", "MegaBin Test"], source);
      git(["config", "user.email", "synthetic@megabin.local"], source);
      writeFileSync(join(source, "release.txt"), "prior\n");
      git(["add", "release.txt"], source);
      git(["commit", "-m", "prior"], source);
      const prior = git(["rev-parse", "HEAD"], source);
      writeFileSync(join(source, "release.txt"), "current\n");
      git(["commit", "-am", "current"], source);
      git(["branch", "-M", "main"], source);
      git(["remote", "add", "origin", origin], source);
      git(["push", "-u", "origin", "main"], source);

      git(["clone", "--depth", "1", "--branch", "main", pathToFileURL(origin).href, shallow]);
      expect(() => git(["merge-base", "--is-ancestor", prior, "origin/main"], shallow)).toThrow();

      git(["fetch", "--unshallow", "--no-tags", "origin", "main"], shallow);
      expect(git(["cat-file", "-e", `${prior}^{commit}`], shallow)).toBe("");
      expect(git(["merge-base", "--is-ancestor", prior, "origin/main"], shallow)).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);

  it("builds an explicit non-destructive rollback and forward-repair plan", () => {
    const prior = "1".repeat(40);
    const current = "2".repeat(40);
    const plan = createRollbackPlan({
      MEGABIN_ENVIRONMENT: "staging",
      CURRENT_RELEASE_SHA: current,
      PRIOR_RELEASE_SHA: prior,
      CONFIRM_ROLLBACK_REHEARSAL: `REHEARSE-ROLLBACK:${prior}`
    });
    expect(plan.status).toBe("PLAN_ONLY");
    expect(plan.components.find((item) => item.component === "database")?.action).toContain(
      "forward repair"
    );
  });

  it("validates the journey-based synthetic UAT catalogue", () => {
    const catalogue = JSON.parse(readFileSync("config/synthetic-uat-catalogue.json", "utf8"));
    expect(validateUatCatalogue(catalogue)).toEqual({ ok: true, cases: 6 });
    const invalid = structuredClone(catalogue);
    invalid.cases[0].result = "Passed";
    expect(() => validateUatCatalogue(invalid)).toThrow("actualOutcome");
  });

  it("bounds UAT data recycling to a confirmed synthetic namespace", () => {
    const contract = JSON.parse(readFileSync("config/synthetic-uat-data.json", "utf8"));
    const ref = "abcdefghijklmnopqrst";
    expect(
      assertUatDataOperation(
        {
          MEGABIN_ENVIRONMENT: "staging",
          SUPABASE_PROJECT_REF: ref,
          PRODUCTION_SUPABASE_PROJECT_REF: "zyxwvutsrqponmlkjihg",
          UAT_DATA_OPERATION: "recycle",
          CONFIRM_UAT_DATA_OPERATION: `UAT-RECYCLE:${ref}:megabin-uat`
        },
        contract
      )
    ).toMatchObject({ status: "BOUNDED_PLAN_ONLY", namespace: "megabin-uat" });
  });

  it("prevents readiness gates passing with unresolved evidence", () => {
    const register = JSON.parse(readFileSync("config/readiness-gates.json", "utf8"));
    expect(validateReadinessGates(register)).toEqual({ ok: true, gates: 5 });
    const invalid = structuredClone(register);
    invalid.gates[3].status = "Passed";
    expect(() => validateReadinessGates(invalid)).toThrow("unresolved approvals");
  });
});
