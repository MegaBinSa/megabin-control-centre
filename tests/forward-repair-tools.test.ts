import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  forwardRepairFixtures,
  inspectForwardRepairFixtures,
  validateEnvironmentProtection,
  validateForwardRepairDispatchInputs,
  validateForwardRepairPlan
} from "../scripts/forward-repair-contract.mjs";
import { buildForwardRepairEvidence } from "../scripts/forward-repair-evidence.mjs";

const source = "xniweqdmswzljcgkfglx";
const target = "ivtaoqorcryzsempsogs";
const sha = "a".repeat(40);
const objectives = {
  sourceProjectRef: source,
  restoreTargetProjectRef: target,
  recoveryAuthority: "Shaun",
  verificationAuthority: "Sidney"
};
const fixtures = "supabase/rehearsal/forward-repair/fixtures";

function validValues() {
  return {
    GITHUB_REF: "refs/heads/main",
    GITHUB_ACTOR: "shaun-login",
    SOURCE_SHA: sha,
    BASELINE_RECOVERY_RUN_ID: "31877345920",
    SCENARIO: "FR-SEMANTIC-INVARIANT-001",
    SOURCE_SUPABASE_PROJECT_REF: source,
    STAGING_SUPABASE_PROJECT_REF: source,
    RESTORE_SUPABASE_PROJECT_REF: target,
    SUPABASE_RECOVERY_PROJECT_REF: target,
    RECOVERY_AUTHORITY_GITHUB_LOGIN: "shaun-login",
    RECOVERY_VERIFIER_GITHUB_LOGIN: "sidney-login",
    CONFIRM_FORWARD_REPAIR: `FORWARD-REPAIR-REHEARSAL:${source}:${target}:${sha}`
  };
}

describe("isolated forward-repair rehearsal contract", () => {
  it("accepts only the approved source, target, scenario, actor and fixtures", () => {
    expect(validateForwardRepairPlan(validValues(), objectives, fixtures)).toMatchObject({
      status: "AUTHORIZED_PLAN_ONLY",
      scenario: "FR-SEMANTIC-INVARIANT-001",
      sourceProjectRef: source,
      recoveryProjectRef: target,
      fixtures: [{ version: "20990101000001" }, { version: "20990101000002" }]
    });
  });

  it("fails closed for arbitrary refs, scenario, confirmation, actor or production target", () => {
    for (const patch of [
      { GITHUB_REF: "refs/heads/feature" },
      { SCENARIO: "arbitrary" },
      { CONFIRM_FORWARD_REPAIR: "FORWARD-REPAIR-REHEARSAL" },
      { GITHUB_ACTOR: "unapproved-login" },
      { PRODUCTION_SUPABASE_PROJECT_REF: target },
      { RESTORE_SUPABASE_PROJECT_REF: source, SUPABASE_RECOVERY_PROJECT_REF: source }
    ]) {
      expect(() =>
        validateForwardRepairPlan({ ...validValues(), ...patch }, objectives, fixtures)
      ).toThrow();
    }
  });

  it("rejects dispatch labels prepended to exact free-text input values", () => {
    const values = validValues();
    for (const patch of [
      { SOURCE_SHA: `source_sha ${values.SOURCE_SHA}` },
      {
        BASELINE_RECOVERY_RUN_ID: `baseline_recovery_run_id ${values.BASELINE_RECOVERY_RUN_ID}`
      },
      {
        CONFIRM_FORWARD_REPAIR: `confirm_forward_repair ${values.CONFIRM_FORWARD_REPAIR}`
      }
    ]) {
      expect(() => validateForwardRepairDispatchInputs({ ...values, ...patch })).toThrow();
    }
  });

  it("checks out the protected event SHA before validating raw dispatch inputs", () => {
    const workflow = readFileSync(".github/workflows/rehearse-staging-forward-repair.yml", "utf8");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).not.toContain("ref: ${{ inputs.source_sha }}");
    expect(workflow).toContain("SOURCE_SHA: ${{ inputs.source_sha }}");
    expect(workflow.indexOf("Check out protected workflow release")).toBeLessThan(
      workflow.indexOf("Validate exact dispatch input values")
    );
  });

  it("writes failure evidence without depending on skipped pnpm setup", () => {
    const workflow = readFileSync(".github/workflows/rehearse-staging-forward-repair.yml", "utf8");
    expect(workflow).toContain("node scripts/forward-repair-evidence.mjs");
    expect(workflow).not.toContain("run: pnpm forward-repair:evidence");
    expect(workflow).toContain("if-no-files-found: warn");
  });

  it("requires enforced independent-review and main-only Environment protection", () => {
    const environment = {
      can_admins_bypass: false,
      deployment_branch_policy: { custom_branch_policies: true },
      protection_rules: [
        {
          type: "required_reviewers",
          prevent_self_review: true,
          reviewers: [{ reviewer: { login: "sidney-login" } }]
        }
      ]
    };
    const policies = [{ name: "main", type: "branch" }];
    expect(validateEnvironmentProtection(environment, policies, "sidney-login")).toEqual({
      ok: true,
      reviewer: "sidney-login",
      branch: "main"
    });
    expect(() =>
      validateEnvironmentProtection(
        { ...environment, can_admins_bypass: true },
        policies,
        "sidney-login"
      )
    ).toThrow("bypass");
    expect(() => validateEnvironmentProtection(environment, policies, "another-login")).toThrow(
      "verifier"
    );
    expect(() =>
      validateEnvironmentProtection(environment, [{ name: "*", type: "branch" }], "sidney-login")
    ).toThrow("main branch");
  });

  it("keeps approved fixtures outside normal migrations and free of guarded destructive SQL", () => {
    const inventory = inspectForwardRepairFixtures(fixtures);
    expect(inventory.map((item) => item.name)).toEqual(forwardRepairFixtures);
    for (const name of forwardRepairFixtures) {
      expect(name).not.toMatch(/^supabase\/migrations/);
      const normalPath = `supabase/migrations/${name}`;
      expect(() => readFileSync(normalPath, "utf8")).toThrow();
    }
  });

  it("rejects an unexpected or destructive fixture inventory", () => {
    const directory = mkdtempSync(join(tmpdir(), "megabin-forward-repair-fixtures-"));
    try {
      writeFileSync(join(directory, forwardRepairFixtures[0]), "drop table app_private.clients;");
      writeFileSync(
        join(directory, forwardRepairFixtures[1]),
        "update assurance_forward_repair.semantic_invariant set semantic_state = 'repaired';"
      );
      expect(() => inspectForwardRepairFixtures(directory)).toThrow("destructive");
      writeFileSync(join(directory, "20990101000003_unapproved.sql"), "select 1;");
      expect(() => inspectForwardRepairFixtures(directory)).toThrow("inventory");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses real forward pushes only with the isolated DB URL and never resets or down-migrates", () => {
    const workflow = readFileSync(".github/workflows/rehearse-staging-forward-repair.yml", "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/\b(push|schedule|pull_request):/);
    expect(workflow).toContain("group: megabin-staging-recovery-rehearsal");
    expect(workflow).toContain('--db-url "$SUPABASE_RECOVERY_DB_URL"');
    expect(workflow).toContain("pnpm exec supabase db push --linked --dry-run");
    expect(workflow).not.toMatch(/supabase db push --linked(?! --dry-run)/);
    expect(workflow).not.toContain("db reset");
    expect(workflow).not.toContain("migration repair");
    expect(workflow).not.toContain("migration down");
    expect(workflow).not.toContain("delete from supabase_migrations");
    expect(workflow).toContain("Shared Staging posture: read-only migration identity checks");
  });

  it("requires the exact expected semantic failure before adding the repair migration", () => {
    const workflow = readFileSync(".github/workflows/rehearse-staging-forward-repair.yml", "utf8");
    const expectedFailure = workflow.indexOf("ERROR:.*MBA-FR-EXPECTED-001");
    const repairCopy = workflow.indexOf("20990101000002_forward_repair_fix.sql", expectedFailure);
    expect(expectedFailure).toBeGreaterThan(-1);
    expect(repairCopy).toBeGreaterThan(expectedFailure);
    expect(workflow).toContain('test "$verification_status" -ne 0');
    expect(workflow).toContain("test \"$(grep -Ec 'ERROR:'");
  });

  it("produces an allowlisted evidence object without credentials or sensitive payloads", () => {
    const evidence = buildForwardRepairEvidence(
      {
        GITHUB_RUN_ID: "123",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_ACTOR: "shaun-login",
        SOURCE_SHA: sha,
        SUPABASE_RECOVERY_DB_URL: "postgres://secret",
        SUPABASE_ACCESS_TOKEN: "secret-token",
        STAGING_OFFICE_PASSWORD: "secret-password",
        FAULT_APPLIED_AT: "2026-08-15T12:00:00Z",
        REPAIR_APPLIED_AT: "2026-08-15T12:01:00Z"
      },
      objectives
    );
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("postgres://");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("secret-password");
    expect(evidence.sharedStagingWriteOperations).toBe(0);
    expect(evidence.independentReviewStatus).toBe("PENDING_POST_RUN_CONFIRMATION");
  });
});
