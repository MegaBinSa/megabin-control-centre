# Recovery Objectives Register

**Status:** Decisions approved; protected logical restore rehearsal not yet run

| Decision | Current posture | Required owner/evidence | Blocks |
|---|---|---|---|
| Target RPO | 1 hour, approved | Shaun | Pilot |
| Achieved RPO | Not achieved | No PITR or retained hourly logical snapshots | Pilot |
| Target RTO | 4 hours, approved | Shaun | Restore acceptance |
| Observed RTO | Not yet measured | Successful isolated rehearsal evidence | Pilot |
| Backup availability | Operator-triggered logical dump only; Supabase Free | Workflow/run evidence | Pilot |
| PITR availability | Disabled | Plan upgrade and explicit enablement would be required | Any PITR claim |
| Restore target | `ivtaoqorcryzsempsogs`, isolated and disposable | Protected Environment/workflow | None after execution proof |
| Recovery authority | Shaun | Approved decision | None |
| Verification authority | Sidney | Independent evidence confirmation | Rehearsal acceptance |
| Evidence retention | 12-month target; 90-day GitHub artifact capability | Durable archive decision | Assurance retention |

The machine-readable source is `config/recovery-objectives.json`. Tooling binds execution to active Staging `xniweqdmswzljcgkfglx` and isolated recovery project `ivtaoqorcryzsempsogs`. A completed evidence record must capture source, target, recovery point, operator, start/end, release and database/migration identities, verification authority, critical reference-data checks, synthetic persona/access checks, integrity assertions and final result.

The Free plan does not provide the approved one-hour recovery point. The logical rehearsal can prove mechanics and observed RTO only. No repository statement or one successful dump substitutes for a scheduled, retained recovery-point posture.
