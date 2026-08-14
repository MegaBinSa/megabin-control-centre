import { readFileSync } from "node:fs";

const projectRefPattern = /^[a-z0-9]{20}$/;

export function assertRestoreRehearsal(values, objectives) {
  if (values.MEGABIN_ENVIRONMENT !== "restore-rehearsal")
    throw new Error("Restore tooling requires MEGABIN_ENVIRONMENT=restore-rehearsal.");
  const source = values.SOURCE_SUPABASE_PROJECT_REF ?? "";
  const target = values.RESTORE_SUPABASE_PROJECT_REF ?? "";
  if (!projectRefPattern.test(source) || !projectRefPattern.test(target))
    throw new Error("Valid source and restore-target project references are required.");
  if (source === target)
    throw new Error("Restore target must be isolated from the source project.");
  if (target === values.STAGING_SUPABASE_PROJECT_REF)
    throw new Error("Active shared Staging cannot be the restore target.");
  if (target === values.PRODUCTION_SUPABASE_PROJECT_REF)
    throw new Error("Production cannot be the restore target.");
  if (values.CONFIRM_RESTORE_REHEARSAL !== `RESTORE-REHEARSAL:${source}:${target}`)
    throw new Error("Explicit source-and-target-bound confirmation is required.");
  if (
    [objectives.rpo, objectives.rto, objectives.recoveryAuthority].some(
      (value) => value === null || value === "UNASSIGNED"
    )
  )
    throw new Error("Approved RPO, RTO and recovery authority are required before rehearsal.");
  if (!values.RECOVERY_POINT) throw new Error("An explicit backup or recovery point is required.");
  return {
    sourceProjectRef: source,
    targetProjectRef: target,
    recoveryPoint: values.RECOVERY_POINT,
    rpo: objectives.rpo,
    rto: objectives.rto,
    recoveryAuthority: objectives.recoveryAuthority
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
