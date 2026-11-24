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

export function validateReadinessNarrative(register, markdown) {
  const rows = new Map();
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const name = cells[0];
    if (!name || name === "Gate" || /^:?-+:?$/u.test(name)) continue;
    rows.set(name, cells[1] ?? "");
  }

  for (const gate of register.gates ?? []) {
    if (!rows.has(gate.name)) {
      throw new Error(`${gate.id} is missing from the readiness narrative.`);
    }
    if (rows.get(gate.name) !== gate.status) {
      throw new Error(
        `${gate.id} narrative status ${rows.get(gate.name)} does not match register status ${gate.status}.`
      );
    }
  }
  return { ok: true, gates: register.gates?.length ?? 0 };
}

if (process.argv[1]?.endsWith("readiness-gates.mjs")) {
  const register = JSON.parse(readFileSync("config/readiness-gates.json", "utf8"));
  const narrative = readFileSync("docs/production/readiness-gates.md", "utf8");
  const gates = validateReadinessGates(register);
  validateReadinessNarrative(register, narrative);
  console.log(`Validated ${gates.gates} evidence-based readiness gates and their narrative.`);
}
