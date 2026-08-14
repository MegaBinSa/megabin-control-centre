import { readFileSync } from "node:fs";

const projectRefPattern = /^[a-z0-9]{20}$/;

function requireApprovedObjectives(objectives) {
  for (const field of [
    "sourceProjectRef",
    "restoreTargetProjectRef",
    "targetRpo",
    "targetRto",
    "recoveryAuthority",
    "verificationAuthority"
  ])
    if (!objectives[field] || objectives[field] === "UNASSIGNED")
      throw new Error(`Approved recovery objective ${field} is required.`);
  if (objectives.pitrPosture !== "DISABLED" || objectives.stagingPlan !== "Free")
    throw new Error(
      "This rehearsal contract is restricted to the approved Free-plan logical path."
    );
  if (objectives.achievedRpo !== null || objectives.rpoStatus !== "NOT_ACHIEVED")
    throw new Error(
      "The one-hour RPO must remain explicitly unachieved without retained hourly evidence."
    );
}

export function assertRestoreRehearsal(values, objectives) {
  requireApprovedObjectives(objectives);
  if (values.MEGABIN_ENVIRONMENT !== "restore-rehearsal")
    throw new Error("Restore tooling requires MEGABIN_ENVIRONMENT=restore-rehearsal.");
  const source = values.SOURCE_SUPABASE_PROJECT_REF ?? "";
  const target = values.RESTORE_SUPABASE_PROJECT_REF ?? values.SUPABASE_RECOVERY_PROJECT_REF ?? "";
  if (!projectRefPattern.test(source) || !projectRefPattern.test(target))
    throw new Error("Valid source and restore-target project references are required.");
  if (source === target)
    throw new Error("Restore target must be isolated from the source project.");
  if (source !== objectives.sourceProjectRef || source !== values.STAGING_SUPABASE_PROJECT_REF)
    throw new Error("Restore source must exactly match approved active Staging.");
  if (target !== objectives.restoreTargetProjectRef)
    throw new Error("Restore target must exactly match the approved isolated recovery project.");
  if (target === values.STAGING_SUPABASE_PROJECT_REF)
    throw new Error("Active shared Staging cannot be the restore target.");
  if (target === values.PRODUCTION_SUPABASE_PROJECT_REF)
    throw new Error("Production cannot be the restore target.");
  if (values.CONFIRM_RESTORE_REHEARSAL !== `RESTORE-REHEARSAL:${source}:${target}`)
    throw new Error("Explicit source-and-target-bound confirmation is required.");
  if (!values.RECOVERY_POINT) throw new Error("An explicit backup or recovery point is required.");
  return {
    sourceProjectRef: source,
    targetProjectRef: target,
    recoveryPoint: values.RECOVERY_POINT,
    targetRpo: objectives.targetRpo,
    achievedRpo: objectives.achievedRpo,
    rpoStatus: objectives.rpoStatus,
    targetRto: objectives.targetRto,
    recoveryAuthority: objectives.recoveryAuthority,
    verificationAuthority: objectives.verificationAuthority,
    backupMechanism: objectives.backupPosture,
    managedBackup: false,
    pitr: false
  };
}

if (process.argv[1]?.endsWith("recovery-contract.mjs")) {
  const objectives = JSON.parse(readFileSync("config/recovery-objectives.json", "utf8"));
  console.log(
    JSON.stringify(
      { status: "AUTHORIZED_PLAN_ONLY", ...assertRestoreRehearsal(process.env, objectives) },
      null,
      2
    )
  );
  console.log(
    "No restore was executed. Follow the approved operator runbook and protected workflow."
  );
}
