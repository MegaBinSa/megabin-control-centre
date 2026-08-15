# Rollback Rehearsal Evidence

**Status:** Passed; prior compatible release deployed and current release restored

The workflow validates two immutable commits from `main`, deploys a known compatible prior release through the protected Staging deployment workflow, runs its smoke verification, and restores current `main` afterward. It covers Office Web, Driver PWA and tracked Edge Functions without downgrading the database.

The protected rehearsal passed in [GitHub Actions run 31881010706](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31881010706) on 15 August 2026. Validation proved that current release `e2837def54f922649965298e27f97357977b0dd0` exactly matched `origin/main`, that prior release `4e471bd250a2757ca67bb0e843c2201d144ac122` was a real commit and ancestor, and that the plan remained forward-only.

The prior release was checked out and deployed to shared Staging. Platform Runtime and Website Onboarding Edge Functions deployed, Office Web and Driver PWA deployed to their existing Cloudflare Pages projects, and the remote smoke suite passed for frontend availability, runtime liveness, release identity, CORS, Office/Driver authentication, authorization denials, fake/capture posture and synthetic website intake. The prior frontend artifacts are `office-web-staging-4e471bd250a2757ca67bb0e843c2201d144ac122` and `driver-pwa-staging-4e471bd250a2757ca67bb0e843c2201d144ac122`.

The workflow then restored current release `e2837def54f922649965298e27f97357977b0dd0`. Both Edge Functions and both frontends redeployed, and every final smoke assertion passed. Final Staging identity is build `e2837def54f922649965298e27f97357977b0dd0`, deployment `github-31881010706-1`; final frontend artifacts are `office-web-staging-e2837def54f922649965298e27f97357977b0dd0` and `driver-pwa-staging-e2837def54f922649965298e27f97357977b0dd0`.

No database rollback, downgrade, reset or migration application occurred. Both deployment passes reported `Remote database is up to date`. Database operations did occur: migration inventory/verification and authorization checks ran, bounded persona provisioning was invoked idempotently, and the smoke suite submitted synthetic website intake (prior pass `200`, restored-current pass `202`). These bounded synthetic operations do not change the schema or represent a database rollback.

Non-blocking warnings were the known Supabase bundler `.js` source-specifier read warnings followed by successful `.ts` uploads/bundles, GitHub Actions Node 20 deprecation notices while actions were forced onto Node 24, and routine tool-update/deprecation notices. None affected deployment or verification.

## Database forward-repair evidence

Database recovery remains forward-only and separate from component rollback. [Run 31906816621](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31906816621) applied the approved synthetic fault and immutable repair migrations only to the isolated recovery target. The expected fault identifier, repaired invariant, restored-data checks, authorization isolation and critical RLS passed; source Staging migration identity remained unchanged and no Staging write, down migration or reset occurred. This closes automated forward-repair execution while independent post-run evidence confirmation, one-hour RPO and durable retention remain open.
