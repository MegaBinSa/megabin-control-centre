# Rollback Rehearsal Evidence

**Status:** Not Run; protected workflow pending merge

The workflow validates two immutable commits from `main`, deploys a known compatible prior release through the protected Staging deployment workflow, runs its smoke verification, and restores current `main` afterward. It covers Office Web, Driver PWA and tracked Edge Functions without downgrading the database.

Database recovery remains forward repair only. No down migration, reset or deliberate shared-Staging corruption is permitted. Actual run IDs and before/prior/restored release identities must be recorded after execution.

