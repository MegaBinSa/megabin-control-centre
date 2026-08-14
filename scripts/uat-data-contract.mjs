import { readFileSync } from "node:fs";

export function assertUatDataOperation(values, contract) {
  if (values.MEGABIN_ENVIRONMENT !== "staging" || contract.environment !== "staging")
    throw new Error("Synthetic UAT data operations are Staging-only.");
  const ref = values.SUPABASE_PROJECT_REF ?? "";
  if (!/^[a-z0-9]{20}$/.test(ref))
    throw new Error("A valid Staging project reference is required.");
  if (ref === values.PRODUCTION_SUPABASE_PROJECT_REF)
    throw new Error("Production cannot be a UAT data target.");
  const operation = values.UAT_DATA_OPERATION;
  if (!["prepare", "recycle"].includes(operation))
    throw new Error("UAT data operation must be prepare or recycle.");
  if (
    values.CONFIRM_UAT_DATA_OPERATION !==
    `UAT-${operation.toUpperCase()}:${ref}:${contract.namespace}`
  )
    throw new Error("Explicit project-and-namespace-bound confirmation is required.");
  return {
    status: "BOUNDED_PLAN_ONLY",
    operation,
    projectRef: ref,
    namespace: contract.namespace,
    preservedPersonas: contract.preservedPersonas,
    resetScope: contract.resetScope
  };
}

if (process.argv[1]?.endsWith("uat-data-contract.mjs")) {
  const contract = JSON.parse(readFileSync("config/synthetic-uat-data.json", "utf8"));
  console.log(JSON.stringify(assertUatDataOperation(process.env, contract), null, 2));
  console.log(
    "No data was changed; execution requires a reviewed journey-specific implementation."
  );
}
