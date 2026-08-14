import { readFileSync, writeFileSync } from "node:fs";

const results = new Set(["Passed", "Failed", "Blocked", "Not Run"]);

export function validateUatCatalogue(catalogue) {
  if (catalogue.environment !== "staging") throw new Error("UAT catalogue must target Staging.");
  const ids = new Set();
  for (const item of catalogue.cases ?? []) {
    if (!/^UAT-[A-Z]{3}-\d{3}$/.test(item.id)) throw new Error(`Invalid UAT ID: ${item.id}.`);
    if (ids.has(item.id)) throw new Error(`Duplicate UAT ID: ${item.id}.`);
    ids.add(item.id);
    for (const field of ["journey", "persona", "expectedOutcome"])
      if (!item[field]) throw new Error(`${item.id} is missing ${field}.`);
    if (!Array.isArray(item.preconditions) || !item.preconditions.length)
      throw new Error(`${item.id} requires preconditions.`);
    if (!Array.isArray(item.steps) || !item.steps.length)
      throw new Error(`${item.id} requires steps.`);
    if (!results.has(item.result)) throw new Error(`${item.id} has an invalid result.`);
    if (["Passed", "Failed"].includes(item.result)) {
      for (const field of [
        "actualOutcome",
        "evidenceReference",
        "executionTimestamp",
        "environmentReleaseIdentity",
        "testerIdentity"
      ])
        if (!item[field]) throw new Error(`${item.id} cannot be ${item.result} without ${field}.`);
    }
  }
  if (!ids.size) throw new Error("At least one UAT case is required.");
  return { ok: true, cases: ids.size };
}

if (process.argv[1]?.endsWith("uat-contract.mjs")) {
  const catalogue = JSON.parse(readFileSync("config/synthetic-uat-catalogue.json", "utf8"));
  const result = validateUatCatalogue(catalogue);
  if (process.argv.includes("--initialize-evidence")) {
    const path = process.env.MEGABIN_UAT_EVIDENCE_PATH ?? "synthetic-uat-evidence.json";
    writeFileSync(path, `${JSON.stringify(catalogue, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    console.log(`Initialized ${path}; all cases remain Not Run.`);
  } else console.log(`Validated ${result.cases} synthetic UAT journey contracts.`);
}
