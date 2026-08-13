import { describe, expect, it, vi } from "vitest";

import { validateEnvironment } from "../scripts/environment-contract.mjs";
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
  MEGABIN_OFFICE_ORIGIN: "https://office.staging.example.test",
  MEGABIN_DRIVER_ORIGIN: "https://driver.staging.example.test",
  MEGABIN_ALLOWED_ORIGINS:
    "https://office.staging.example.test,https://driver.staging.example.test",
  MEGABIN_WEBSITE_ONBOARDING_INTEGRATION_KEY: "website-staging",
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
  MEGABIN_AUTO_SKIP_REPLAN: "false"
};

describe("staging environment contract", () => {
  it("accepts safe synthetic staging configuration", () => {
    expect(validateEnvironment("staging", staging)).toEqual({ ok: true, errors: [] });
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 202 });
    const checks = await runSmoke(staging, fetchMock as unknown as typeof fetch);
    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it("reports a failed remote smoke invariant", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 202 });
    const checks = await runSmoke(staging, fetchMock as unknown as typeof fetch);
    expect(checks.find((check) => check.name === "driver_frontend")?.passed).toBe(false);
  });
});
