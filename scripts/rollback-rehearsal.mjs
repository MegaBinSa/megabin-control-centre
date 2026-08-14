export function createRollbackPlan(values) {
  if (values.MEGABIN_ENVIRONMENT !== "staging")
    throw new Error("Rollback rehearsal is Staging-only.");
  if (!/^[a-f0-9]{40}$/.test(values.CURRENT_RELEASE_SHA ?? ""))
    throw new Error("Current release SHA is required.");
  if (!/^[a-f0-9]{40}$/.test(values.PRIOR_RELEASE_SHA ?? ""))
    throw new Error("Prior release SHA is required.");
  if (values.CURRENT_RELEASE_SHA === values.PRIOR_RELEASE_SHA)
    throw new Error("Prior release must differ from current release.");
  if (values.CONFIRM_ROLLBACK_REHEARSAL !== `REHEARSE-ROLLBACK:${values.PRIOR_RELEASE_SHA}`)
    throw new Error("Explicit prior-release-bound confirmation is required.");
  return {
    status: "PLAN_ONLY",
    environment: "staging",
    currentReleaseSha: values.CURRENT_RELEASE_SHA,
    priorReleaseSha: values.PRIOR_RELEASE_SHA,
    components: [
      { component: "office-web", action: "redeploy immutable prior artifact" },
      { component: "driver-pwa", action: "redeploy immutable prior artifact" },
      {
        component: "edge-functions",
        action: "redeploy tracked prior source after compatibility review"
      },
      {
        component: "database",
        action: "review and apply forward repair only; no automatic down migration"
      }
    ],
    requiredVerification: ["release identity", "migration history", "remote smoke suite"]
  };
}

if (process.argv[1]?.endsWith("rollback-rehearsal.mjs"))
  console.log(JSON.stringify(createRollbackPlan(process.env), null, 2));
