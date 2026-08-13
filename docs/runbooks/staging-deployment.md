# Staging Deployment Runbook

1. Confirm CI and Security checks are green for the SHA and the SHA is contained in `main`.
2. Confirm the GitHub `staging` Environment, Supabase project and frontend hosts are the intended targets.
3. Review configuration names/status with `pnpm env:validate:staging -- --deployment`; never paste values into logs.
4. Review the migration inventory and dry-run. Set destructive approval only after a named reviewer accepts every finding.
5. Dispatch `Deploy staging` with the full SHA and `DEPLOY-STAGING` confirmation.
6. Observe migration, schema lint, explicit Function deployments, artifact build/host deployment and smoke steps. Do not skip a failed stage.
7. Verify health build SHA/run ID, fake-provider posture, communication capture mode and monitoring visibility.
8. Complete the release checklist and link workflow/artifact/rollback references.

The workflow currently fails at the frontend integration gate until hosting is approved and configured. Do not call an artifact-only run a deployment.
