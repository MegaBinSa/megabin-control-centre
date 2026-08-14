import { readFileSync } from "node:fs";

const statuses = new Set(["Passed", "Blocked", "Not Run"]);

export function validateReadinessGates(register) {
  const ids = new Set();
  for (const gate of register.gates ?? []) {
    if (!/^GATE-[A-Z-]+$/.test(gate.id) || ids.has(gate.id))
      throw new Error(`Invalid or duplicate gate ${gate.id}.`);
    ids.add(gate.id);
    if (!statuses.has(gate.status)) throw new Error(`${gate.id} has invalid status.`);
    for (const field of ["automatedEvidence", "humanApprovals", "externalDependencies"])
      if (!Array.isArray(gate[field])) throw new Error(`${gate.id} requires ${field}.`);
    if (
      gate.status === "Passed" &&
      (gate.humanApprovals.length || gate.externalDependencies.length)
    )
      throw new Error(`${gate.id} cannot pass with unresolved approvals or dependencies.`);
  }
  return { ok: true, gates: ids.size };
}

if (process.argv[1]?.endsWith("readiness-gates.mjs")) {
  const register = JSON.parse(readFileSync("config/readiness-gates.json", "utf8"));
  console.log(
    `Validated ${validateReadinessGates(register).gates} evidence-based readiness gates.`
  );
}
