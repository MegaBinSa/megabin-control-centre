import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { inspectSql } from "./migration-safety.mjs";

export const forwardRepairScenario = "FR-SEMANTIC-INVARIANT-001";
export const forwardRepairFixtures = [
  "20990101000001_forward_repair_fault.sql",
  "20990101000002_forward_repair_fix.sql"
];

const shaPattern = /^[a-f0-9]{40}$/;
const projectRefPattern = /^[a-z0-9]{20}$/;
const runIdPattern = /^[1-9][0-9]*$/;

function requireValue(name, value) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function inspectForwardRepairFixtures(fixtureDirectory) {
  const inventory = readdirSync(fixtureDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (JSON.stringify(inventory) !== JSON.stringify(forwardRepairFixtures))
    throw new Error("Forward-repair fixture inventory differs from the approved files.");

  return inventory.map((name) => {
    const path = join(fixtureDirectory, name);
    const sql = readFileSync(path, "utf8");
    const findings = inspectSql(sql, path);
    if (findings.length)
      throw new Error(
        `Forward-repair fixture contains guarded destructive SQL: ${findings
          .map((finding) => finding.kind)
          .join(",")}`
      );
    if (/\b(app_private|api|public|auth|storage)\s*\./i.test(sql))
      throw new Error("Forward-repair fixtures may not reference application or platform tables.");
    if (!/\bassurance_forward_repair\s*\./i.test(sql))
      throw new Error("Forward-repair fixtures must remain in assurance_forward_repair.");
    return { name, version: name.slice(0, 14), sha256: hash(sql) };
  });
}

export function validateForwardRepairPlan(values, objectives, fixtureDirectory) {
  const sourceSha = requireValue("SOURCE_SHA", values.SOURCE_SHA);
  if (!shaPattern.test(sourceSha)) throw new Error("SOURCE_SHA must be a full immutable SHA.");
  if (values.GITHUB_REF !== "refs/heads/main")
    throw new Error("Forward-repair rehearsal must be dispatched from main.");
  if (values.SCENARIO !== forwardRepairScenario)
    throw new Error("Only the approved forward-repair scenario is allowed.");
  if (!runIdPattern.test(values.BASELINE_RECOVERY_RUN_ID ?? ""))
    throw new Error("A numeric baseline recovery run ID is required.");

  const source = requireValue("SOURCE_SUPABASE_PROJECT_REF", values.SOURCE_SUPABASE_PROJECT_REF);
  const target = requireValue("RESTORE_SUPABASE_PROJECT_REF", values.RESTORE_SUPABASE_PROJECT_REF);
  if (!projectRefPattern.test(source) || !projectRefPattern.test(target))
    throw new Error("Approved Supabase project references are required.");
  if (source !== objectives.sourceProjectRef || source !== values.STAGING_SUPABASE_PROJECT_REF)
    throw new Error("Source must exactly match approved shared Staging.");
  if (
    target !== objectives.restoreTargetProjectRef ||
    target !== values.SUPABASE_RECOVERY_PROJECT_REF
  )
    throw new Error("Target must exactly match the approved isolated recovery project.");
  if (source === target) throw new Error("Source and recovery target must differ.");
  if (target === values.PRODUCTION_SUPABASE_PROJECT_REF)
    throw new Error("Production cannot be a forward-repair target.");
  if (values.CONFIRM_FORWARD_REPAIR !== `FORWARD-REPAIR-REHEARSAL:${source}:${target}:${sourceSha}`)
    throw new Error("Source, target and SHA-bound confirmation is required.");

  const authorityLogin = requireValue(
    "RECOVERY_AUTHORITY_GITHUB_LOGIN",
    values.RECOVERY_AUTHORITY_GITHUB_LOGIN
  );
  const verifierLogin = requireValue(
    "RECOVERY_VERIFIER_GITHUB_LOGIN",
    values.RECOVERY_VERIFIER_GITHUB_LOGIN
  );
  if (authorityLogin === verifierLogin)
    throw new Error("Recovery authority and independent verifier must use different accounts.");
  if (values.GITHUB_ACTOR !== authorityLogin)
    throw new Error("Only the configured recovery authority may dispatch this rehearsal.");

  return {
    status: "AUTHORIZED_PLAN_ONLY",
    scenario: forwardRepairScenario,
    sourceSha,
    sourceProjectRef: source,
    recoveryProjectRef: target,
    baselineRecoveryRunId: values.BASELINE_RECOVERY_RUN_ID,
    recoveryAuthority: objectives.recoveryAuthority,
    independentVerifier: objectives.verificationAuthority,
    configuredAuthorityLogin: authorityLogin,
    configuredVerifierLogin: verifierLogin,
    fixtures: inspectForwardRepairFixtures(fixtureDirectory)
  };
}

export function validateEnvironmentProtection(environment, branchPolicies, verifierLogin) {
  if (environment.can_admins_bypass !== false)
    throw new Error("Administrator Environment bypass must be disabled.");
  const reviewRule = environment.protection_rules?.find(
    (rule) => rule.type === "required_reviewers"
  );
  if (!reviewRule) throw new Error("A required-reviewer Environment rule is required.");
  if (reviewRule.prevent_self_review !== true)
    throw new Error("Environment self-review prevention must be enabled.");
  const reviewers = (reviewRule.reviewers ?? []).map(
    (entry) => entry.reviewer?.login ?? entry.reviewer?.slug
  );
  if (!reviewers.includes(verifierLogin))
    throw new Error("The configured independent verifier must be an Environment reviewer.");
  if (!environment.deployment_branch_policy?.custom_branch_policies)
    throw new Error("The Environment must use a custom main-only deployment branch policy.");
  if (
    branchPolicies.length !== 1 ||
    branchPolicies[0]?.name !== "main" ||
    branchPolicies[0]?.type !== "branch"
  )
    throw new Error("The staging-recovery Environment must allow only the main branch.");
  return { ok: true, reviewer: verifierLogin, branch: "main" };
}

if (process.argv[1]?.endsWith("forward-repair-contract.mjs")) {
  const objectives = JSON.parse(readFileSync("config/recovery-objectives.json", "utf8"));
  const fixtureDirectory = "supabase/rehearsal/forward-repair/fixtures";
  console.log(
    JSON.stringify(validateForwardRepairPlan(process.env, objectives, fixtureDirectory), null, 2)
  );
}
