import { readFileSync, writeFileSync } from "node:fs";

function requireIsoTimestamp(name, value) {
  if (!value || Number.isNaN(Date.parse(value)))
    throw new Error(`${name} must be an ISO timestamp.`);
  return value;
}

export function buildRecoveryEvidence(values, objectives) {
  const startedAt = requireIsoTimestamp("RESTORE_STARTED_AT", values.RESTORE_STARTED_AT);
  const completedAt = requireIsoTimestamp("RESTORE_COMPLETED_AT", values.RESTORE_COMPLETED_AT);
  const elapsedSeconds = Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000);
  if (elapsedSeconds < 0) throw new Error("Restore completion cannot precede its start.");
  return {
    schemaVersion: 1,
    rehearsalType: "free-plan-logical-dump-isolated-restore",
    result: values.RESTORE_RESULT ?? "Failed",
    sourceProjectRef: objectives.sourceProjectRef,
    targetProjectRef: objectives.restoreTargetProjectRef,
    recoveryPoint: values.RECOVERY_POINT,
    dumpCreatedAt: requireIsoTimestamp("DUMP_CREATED_AT", values.DUMP_CREATED_AT),
    restoreStartedAt: startedAt,
    restoreCompletedAt: completedAt,
    elapsedSeconds,
    targetRto: objectives.targetRto,
    observedRtoMet: elapsedSeconds <= 4 * 60 * 60 && values.RESTORE_RESULT === "Passed",
    targetRpo: objectives.targetRpo,
    achievedRpo: null,
    rpoStatus: "NOT_ACHIEVED",
    sourceReleaseIdentity: values.SOURCE_RELEASE_IDENTITY ?? null,
    migrationIdentity: values.MIGRATION_IDENTITY ?? null,
    operator: values.GITHUB_ACTOR ?? "unknown",
    recoveryAuthority: objectives.recoveryAuthority,
    independentVerifier: objectives.verificationAuthority,
    verificationStatus: "PENDING_INDEPENDENT_CONFIRMATION",
    integrityChecks: (values.INTEGRITY_CHECKS ?? "").split(",").filter(Boolean),
    managedBackup: false,
    pitr: false,
    evidenceRetentionTarget: objectives.assuranceEvidenceRetentionTarget,
    evidenceRetentionAchieved: null
  };
}

if (process.argv[1]?.endsWith("recovery-evidence.mjs")) {
  const objectives = JSON.parse(readFileSync("config/recovery-objectives.json", "utf8"));
  const evidence = buildRecoveryEvidence(process.env, objectives);
  const output = process.env.RECOVERY_EVIDENCE_PATH ?? "recovery-rehearsal-evidence.json";
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`Recovery evidence written to ${output}.`);
}
