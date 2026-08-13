# Staging Reset Runbook

Reset is destructive, exceptional and never part of deployment. Confirm the target project is dedicated Staging, no UAT evidence must be retained, source artifacts are synthetic, and affected users are notified. Record the project reference and current deployment/migration state.

Set `MEGABIN_ENVIRONMENT=staging`, the exact `SUPABASE_PROJECT_REF`, a separately recorded `PRODUCTION_SUPABASE_PROJECT_REF`, and `CONFIRM_STAGING_RESET=RESET-STAGING:<project-ref>`. Run `node scripts/staging-reset.mjs` first without `--execute`; only an approved operator may add `--execute`. The guard rejects other environments, malformed references, missing project-bound confirmation and a target matching Production.

After reset, replay migrations, apply the idempotent synthetic seed, provision synthetic personas without committed passwords, deploy Functions/frontends and run the full Staging smoke suite. Preserve workflow and approval evidence.
