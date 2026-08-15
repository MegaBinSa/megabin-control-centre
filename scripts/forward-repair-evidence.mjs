import { readFileSync, writeFileSync } from "node:fs";

function optionalTimestamp(value) {
  if (!value) return null;
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid evidence timestamp: ${value}`);
  return value;
}

export function buildForwardRepairEvidence(values, objectives) {
  return {
    schemaVersion: 1,
    rehearsalType: "isolated-supabase-migration-forward-repair",
    scenarioId: "FR-SEMANTIC-INVARIANT-001",
    result: values.FORWARD_REPAIR_RESULT ?? "Failed",
    workflowRunId: values.GITHUB_RUN_ID ?? null,
    workflowRunAttempt: values.GITHUB_RUN_ATTEMPT ?? null,
    operator: values.GITHUB_ACTOR ?? "unknown",
    configuredRecoveryAuthorityLogin: values.RECOVERY_AUTHORITY_GITHUB_LOGIN ?? null,
    configuredIndependentReviewerLogin: values.RECOVERY_VERIFIER_GITHUB_LOGIN ?? null,
    approvingReviewer: null,
    independentReviewStatus: "PENDING_POST_RUN_CONFIRMATION",
    recoveryAuthority: objectives.recoveryAuthority,
    independentVerifier: objectives.verificationAuthority,
    sourceSha: values.SOURCE_SHA ?? null,
    verifiedOriginMainSha: values.VERIFIED_ORIGIN_MAIN_SHA ?? null,
    sourceProjectRef: objectives.sourceProjectRef,
    recoveryProjectRef: objectives.restoreTargetProjectRef,
    baselineRecoveryRunId: values.BASELINE_RECOVERY_RUN_ID ?? null,
    faultMigration: {
      version: "20990101000001",
      sha256: values.FAULT_MIGRATION_SHA256 ?? null,
      result: values.FAULT_APPLICATION_RESULT ?? "Not Run",
      appliedAt: optionalTimestamp(values.FAULT_APPLIED_AT),
      verification: values.FAULT_VERIFICATION_RESULT ?? "Not Run",
      expectedFailure: "MBA-FR-EXPECTED-001"
    },
    repairMigration: {
      version: "20990101000002",
      sha256: values.REPAIR_MIGRATION_SHA256 ?? null,
      result: values.REPAIR_APPLICATION_RESULT ?? "Not Run",
      appliedAt: optionalTimestamp(values.REPAIR_APPLIED_AT)
    },
    migrationIdentity: {
      sourceBefore: values.SOURCE_MIGRATION_IDENTITY_BEFORE ?? null,
      sourceAfter: values.SOURCE_MIGRATION_IDENTITY_AFTER ?? null,
      recoveryBefore: values.RECOVERY_MIGRATION_IDENTITY_BEFORE ?? null,
      recoveryAfterFault: values.RECOVERY_MIGRATION_IDENTITY_AFTER_FAULT ?? null,
      recoveryAfterRepair: values.RECOVERY_MIGRATION_IDENTITY_AFTER_REPAIR ?? null
    },
    postRepairInvariant: values.POST_REPAIR_INVARIANT_RESULT ?? "Not Run",
    integrityVerification: (values.INTEGRITY_VERIFICATION ?? "").split(",").filter(Boolean),
    sharedStagingWriteOperations: 0,
    sharedStagingPosture: "READ_ONLY_MIGRATION_IDENTITY_CHECKS_ONLY",
    isolatedTargetLeftIntact: true,
    prohibitedOperations: [
      "down migration",
      "migration-history deletion",
      "shared Staging reset",
      "automatic target cleanup"
    ],
    residualRisks: [
      "Independent reviewer confirmation remains external to workflow execution.",
      "Workflow artifacts retain for 90 days; the approved 12-month target remains unmet.",
      "The one-hour RPO remains unmet."
    ]
  };
}

if (process.argv[1]?.endsWith("forward-repair-evidence.mjs")) {
  const objectives = JSON.parse(readFileSync("config/recovery-objectives.json", "utf8"));
  const evidence = buildForwardRepairEvidence(process.env, objectives);
  const output = process.env.FORWARD_REPAIR_EVIDENCE_PATH ?? "forward-repair-evidence.json";
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`Forward-repair evidence written to ${output}.`);
}
