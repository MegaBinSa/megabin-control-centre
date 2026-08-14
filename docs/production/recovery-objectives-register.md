# Recovery Objectives Register

**Status:** Decision required; no restore success claimed

| Decision | Current posture | Required owner/evidence | Blocks |
|---|---|---|---|
| RPO | Unapproved | Business and technical approval by environment/data class | Restore rehearsal, Pilot |
| RTO | Unapproved | Business and technical approval including acceptable outage | Restore rehearsal, Pilot |
| Backup availability | Unverified for the Staging plan | Supabase project/plan evidence and available recovery points | Restore rehearsal |
| PITR availability | Unverified and not assumed | Explicit Supabase project capability/retention evidence | Any PITR claim |
| Restore target | Not configured | Independently identified non-production project, distinct from active Staging | Restore rehearsal |
| Recovery authority | Unassigned | Named authorized operator/approver | Recovery execution |
| Verification authority | Unassigned | Named independent verifier | Rehearsal acceptance |

The machine-readable source is `config/recovery-objectives.json`. Tooling refuses to authorize a rehearsal while RPO, RTO or recovery authority is unresolved. A completed evidence record must capture source, target, recovery point, operator, start/end, release and database/migration identities, verification authority, critical reference-data checks, synthetic persona/access checks, integrity assertions and final result.

Supabase currently documents daily/physical backup and PITR behavior as plan/capability dependent. Restore to a new project creates an independent database copy but does not copy all platform configuration such as Edge Functions and Storage objects; those require separate verification. No repository statement substitutes for inspecting the actual project plan and backup page.

