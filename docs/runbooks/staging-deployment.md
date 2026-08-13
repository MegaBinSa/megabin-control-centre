# Staging Deployment Runbook

1. Confirm CI and Security checks are green for the SHA and the SHA is contained in `main`.
2. Confirm the GitHub `staging` Environment, Supabase project and frontend hosts are the intended targets.
3. Review configuration names/status with `pnpm env:validate:staging -- --deployment`; never paste values into logs.
4. Review the migration inventory and dry-run. Set destructive approval only after a named reviewer accepts every finding.
5. Dispatch `Deploy staging` with the current reviewed merge SHA from `main` and `DEPLOY-STAGING` confirmation. Never reuse an older requested SHA after a deployment-control fix has merged.
6. Observe the hosted Data API contract check, migration plus deterministic seed, bounded persona provisioning/verification, application-schema lint, deployment-equivalent Edge bundle verification, explicit Function deployments, Cloudflare Pages deployments and smoke steps. Do not skip a failed stage. The Data API check idempotently preserves existing exposed schemas and adds/verifies `api`; a failure stops before runtime smoke. The lint gate covers the MegaBin-owned `app_private`, `api` and `public` schemas with `--fail-on error`; Supabase/PostGIS-managed extension implementation schemas are intentionally outside this ownership boundary.
7. Confirm the workflow verifies repository-pinned Wrangler `4.123.0` before both Pages deployments. Any attempt by an action to add or upgrade Wrangler dynamically is a deployment-contract failure.
8. Verify health `buildId`/deployment ID, hosted gateway preflight behavior, allowed actual-request CORS, unknown-origin actual-request denial, Office/Driver authorization boundaries, fake-provider posture, communication capture mode and website intake idempotency.
9. Complete the release checklist and link workflow/artifact/rollback references.

The workflow deploys only a reviewed SHA contained in `main`. Do not weaken this gate to test a feature branch; merge first, then dispatch the merge SHA.

If a run stops after migrations and seed, rerun the reviewed merged SHA after correcting the failing control. The workflow inventories migration history and performs a dry run before its idempotent `db push --include-seed`; already-recorded migrations are not manually replayed, the deterministic seed remains safe to repeat, and persona provisioning follows only after database verification succeeds. Never reset Staging merely to resume a partially completed deployment.
