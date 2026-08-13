# Rollback and Recovery Runbook

- **Frontend:** redeploy the last known-good immutable Office/Driver artifacts and verify build identity/smoke checks.
- **Edge Functions:** redeploy the tracked Function source from the last known-good SHA; verify secrets still match the Staging contract.
- **Configuration:** restore the prior reviewed key values through their owning secret/config store; never recover from local `.env` files.
- **Database:** default to a corrective forward migration. SQL rollback is migration-specific and never assumed. Restore is an incident action governed by the backup runbook and approved data-loss/downtime decision.

If smoke tests fail, hold the release, prevent users entering the target where possible, capture the failed run, restore safe frontend/Function versions, assess database state and rerun smoke only after remediation. A release is not successful because one component deployed.
