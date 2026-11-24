# Evidence-Based Readiness Gates

**Status:** Reconciled with `config/readiness-gates.json` on 2026-11-24
**Current stage:** Synthetic Internal UAT Passed. Controlled Pilot Ready and Production Ready remain Blocked.

| Gate | Current result | Automated evidence | Human/external evidence still required |
|---|---|---|---|
| Shared Staging Ready | Passed | Protected deployment 31738092512, migrations, Functions/frontends, personas, authorization and remote smoke | Preserve repeatability |
| Synthetic Internal UAT Ready | Passed | Staging platform, catalogue, data/fake/capture contracts and proven monitoring notification route | Preserve environment controls |
| Synthetic Internal UAT Passed | Passed | UAT-OFF-001 Passed, UAT-DRV-001 Passed, UAT-WEB-001 Passed, UAT-SKP-001 Passed, UAT-FIN-001 Passed, UAT-TRK-001 Passed | Human sign-off recorded 2026-10-17 in the [pilot-entry packet](synthetic-uat-signoff-and-pilot-entry.md). Repeat affected journeys only after a material change |
| Controlled Pilot Ready | Blocked | Isolated logical restore passed in run 31877345920 with a 296-second observed RTO; alert delivery passed in run 31878853824; component rollback/current restoration passed in run 31881010706; isolated forward repair passed in run 31906816621 | Independent recovery evidence confirmation; achieved one-hour RPO or accepted exception; privacy/security/business approvals; support, device/field/provider and migration validation |
| Production Ready | Blocked | Not sufficient | Production infrastructure, providers, retention/cutover decisions, full recovery and production validation |

The machine-readable register is `config/readiness-gates.json`. `pnpm readiness:validate` fails when this table's current result differs from that register. A gate cannot be promoted because documentation exists; every required automated result, human approval and external dependency must have a durable reference.

## Current execution status

- **Passed:** shared Staging; Synthetic Internal UAT readiness; all six release-bound synthetic journeys; aggregate Synthetic Internal UAT Passed, with the project user's explicit approval on 2026-10-17.
- **Passed assurance:** isolated logical restore mechanics and automated integrity checks; observed RTO within four hours; controlled alert delivery with human mailbox confirmation; Office/Driver/Edge Function rollback and current-release restoration; isolated database forward repair with zero shared-Staging writes.
- **Pending human evidence:** Sidney's independent restore and forward-repair evidence confirmations.
- **Blocked:** one-hour RPO; 12-month evidence retention; named pilot ownership and scope; privacy, role, device, provider and migration prerequisites; Production Ready.

Phase 5E closed before `UAT-FIN-001` and `UAT-TRK-001` had execution evidence. Those journeys later Passed on release `7d102000b49e02e7387bdd07210e46563a53c54d`. The historical rehearsal record remains in [Phase 5E assurance evidence](phase-5e-assurance-evidence.md). Do not rerun the synthetic fixtures to refresh this page.
