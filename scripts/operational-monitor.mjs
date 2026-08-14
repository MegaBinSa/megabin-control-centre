import { readFileSync, writeFileSync } from "node:fs";

import { runSmoke } from "./staging-smoke.mjs";

export function buildMonitoringEvidence(values, checks, definition, now = new Date()) {
  if (definition.environment !== "staging")
    throw new Error("Monitoring definition must be staging.");
  const configured = new Map(
    definition.alerts.filter((alert) => alert.check).map((alert) => [alert.check, alert])
  );
  const execution = definition.alerts.find((alert) => alert.sourceWorkflow === "Monitor staging");
  if (!execution) throw new Error("Monitor execution alert definition is missing.");
  const alerts = [
    {
      alertId: execution.id,
      deduplicationKey: `staging:${execution.id}`,
      severity: execution.severity,
      check: "monitor_execution",
      state: "Resolved",
      owner: execution.owner ?? definition.defaultOwner,
      deliveryDestination: definition.deliveryDestination,
      responseExpectation: execution.response,
      observedStatus: 0,
      observedAt: now.toISOString(),
      acknowledgement: null,
      resolution: { source: "monitor", at: now.toISOString() }
    },
    ...checks.map((check) => {
      const alert = configured.get(check.name);
      if (!alert) throw new Error(`No stable alert definition exists for ${check.name}.`);
      return {
        alertId: alert.id,
        deduplicationKey: `staging:${alert.id}`,
        severity: alert.severity,
        check: check.name,
        state: check.passed ? "Resolved" : "Open",
        owner: alert.owner ?? definition.defaultOwner,
        deliveryDestination: definition.deliveryDestination,
        responseExpectation: alert.response,
        observedStatus: check.status,
        observedAt: now.toISOString(),
        acknowledgement: null,
        resolution: check.passed ? { source: "monitor", at: now.toISOString() } : null
      };
    })
  ];
  const observedRelease = checks.find((check) => check.name === "release_identity")?.observed;
  return {
    schemaVersion: 1,
    runId: values.GITHUB_RUN_ID ?? `local-${now.getTime()}`,
    environment: "staging",
    release: {
      environment: observedRelease?.environment ?? null,
      buildSha: observedRelease?.buildId ?? values.VITE_BUILD_SHA ?? null,
      deploymentId: observedRelease?.deploymentId ?? values.VITE_DEPLOYMENT_ID ?? null
    },
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    outcome: alerts.every((alert) => alert.state === "Resolved") ? "Passed" : "Failed",
    alerts
  };
}

export async function runOperationalMonitor(values, fetchImpl = fetch, now = new Date()) {
  const definition = JSON.parse(readFileSync("config/operational-alerts.json", "utf8"));
  const evidence = buildMonitoringEvidence(
    values,
    await runSmoke(values, fetchImpl),
    definition,
    now
  );
  if (values.MEGABIN_SYNTHETIC_ALERT_PROOF === "MBA-STG-MON-TEST-001") {
    const proof = definition.alerts.find(
      (alert) => alert.id === values.MEGABIN_SYNTHETIC_ALERT_PROOF
    );
    if (!proof) throw new Error("Synthetic alert proof identifier is not registered.");
    evidence.alerts.push({
      alertId: proof.id,
      deduplicationKey: `staging:${proof.id}:${values.GITHUB_RUN_ID ?? "local"}`,
      severity: proof.severity,
      check: "synthetic_alert_delivery_proof",
      state: "Open",
      owner: definition.defaultOwner,
      escalationOwner: definition.escalationOwner,
      deliveryDestination: definition.deliveryDestination,
      deliveryRecipient: definition.deliveryRecipient,
      deliveryVerification: "HUMAN_CONFIRMATION_REQUIRED",
      responseExpectation: proof.response,
      observedStatus: 1,
      observedAt: now.toISOString(),
      acknowledgement: null,
      resolution: null,
      synthetic: true
    });
    evidence.outcome = "Failed";
  }
  return evidence;
}

if (process.argv[1]?.endsWith("operational-monitor.mjs")) {
  const output = process.env.MEGABIN_MONITOR_EVIDENCE_PATH ?? "monitoring-evidence.json";
  let evidence;
  try {
    evidence = await runOperationalMonitor(process.env);
  } catch {
    const now = new Date().toISOString();
    evidence = {
      schemaVersion: 1,
      runId: process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
      environment: "staging",
      release: { buildSha: null, deploymentId: null },
      startedAt: now,
      completedAt: now,
      outcome: "Failed",
      alerts: [
        {
          alertId: "MBA-STG-MON-001",
          deduplicationKey: "staging:MBA-STG-MON-001",
          severity: "SEV1",
          check: "monitor_execution",
          state: "Open",
          owner: "Shaun",
          escalationOwner: "Shaun",
          deliveryDestination: "github-actions-email",
          deliveryRecipient: "infomegabin@gmail.com",
          deliveryVerification: "HUMAN_CONFIRMATION_REQUIRED",
          responseExpectation: "Investigate a missed or failed scheduled monitor execution.",
          observedStatus: 0,
          observedAt: now,
          acknowledgement: null,
          resolution: null
        }
      ]
    };
  }
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  console.log(`Monitoring evidence written to ${output}; outcome=${evidence.outcome}.`);
  if (evidence.outcome !== "Passed") process.exit(1);
}
