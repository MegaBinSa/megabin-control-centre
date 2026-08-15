# Recovery Objectives Register

**Status:** Logical restore rehearsal passed; RPO and independent verification remain open

| Decision | Current posture | Required owner/evidence | Blocks |
|---|---|---|---|
| Target RPO | 1 hour, approved | Shaun | Pilot |
| Achieved RPO | Not achieved | No PITR or retained hourly logical snapshots | Pilot |
| Target RTO | 4 hours, approved | Shaun | Restore acceptance |
| Observed RTO | 296 seconds (4 minutes 56 seconds), Passed against four-hour target | Run 31877345920; Sidney confirmation pending | Rehearsal acceptance |
| Backup availability | Operator-triggered logical dump only; Supabase Free | Workflow/run evidence | Pilot |
| PITR availability | Disabled | Plan upgrade and explicit enablement would be required | Any PITR claim |
| Restore target | `ivtaoqorcryzsempsogs`, isolated and disposable; restore passed | Run 31877345920 | None for logical-restore mechanics |
| Recovery authority | Shaun | Approved decision | None |
| Verification authority | Sidney | Independent evidence confirmation | Rehearsal acceptance |
| Evidence retention | 12-month target; 90-day GitHub artifact capability | Durable archive decision | Assurance retention |

The machine-readable source is `config/recovery-objectives.json`. Tooling binds execution to active Staging `xniweqdmswzljcgkfglx` and isolated recovery project `ivtaoqorcryzsempsogs`. A completed evidence record must capture source, target, recovery point, operator, start/end, release and database/migration identities, verification authority, critical reference-data checks, synthetic persona/access checks, integrity assertions and final result.

Recovery rehearsal #6 ([run 31877345920](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31877345920)) proved the logical restore mechanics and measured a 296-second RTO with all configured integrity checks passing. Sidney's independent confirmation is still required to accept the rehearsal evidence.

The Free plan does not provide the approved one-hour recovery point. The successful logical rehearsal proves mechanics and observed RTO only. No repository statement or one successful dump substitutes for a scheduled, retained recovery-point posture.
