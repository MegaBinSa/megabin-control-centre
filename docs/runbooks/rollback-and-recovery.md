# Rollback and Recovery Runbook

- **Frontend:** redeploy the last known-good immutable Office/Driver artifacts and verify build identity/smoke checks.
- **Edge Functions:** redeploy the tracked Function source from the last known-good SHA; verify secrets still match the Staging contract.
- **Configuration:** restore the prior reviewed key values through their owning secret/config store; never recover from local `.env` files.
- **Database:** default to a corrective forward migration. SQL rollback is migration-specific and never assumed. Restore is an incident action governed by the backup runbook and approved data-loss/downtime decision.

If smoke tests fail, hold the release, prevent users entering the target where possible, capture the failed run, restore safe frontend/Function versions, assess database state and rerun smoke only after remediation. A release is not successful because one component deployed.

Before a rehearsal, use `pnpm rollback:plan` with current/prior 40-character release SHAs and confirmation bound to the prior SHA. Verify the prior commit/artifacts exist and its API remains compatible with the current database. Rehearse Office and Driver independently so frontend rollback cannot change database truth. Edge Functions require a compatibility review before redeployment. Database failure follows the migration forward-repair runbook. Retain selected identities, operator, timestamps, actions and post-recovery smoke evidence.

Run 31881010706 proved the Staging component path using prior `4e471bd250a2757ca67bb0e843c2201d144ac122` and current `e2837def54f922649965298e27f97357977b0dd0`. Both releases passed deployment/smoke verification and current main was restored. The database remained on its existing migration history; bounded synthetic provisioning and smoke writes still occurred through the normal deployment workflow.
