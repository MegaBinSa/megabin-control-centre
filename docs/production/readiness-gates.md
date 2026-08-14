# Evidence-Based Readiness Gates

| Gate | Current result | Automated evidence | Human/external evidence still required |
|---|---|---|---|
| Shared Staging Ready | Passed | Protected deployment 31738092512, migrations, Functions/frontends, personas, authorization and remote smoke | Preserve repeatability |
| Synthetic Internal UAT Ready | Blocked | Staging platform, catalogue, data and fake/capture contracts | Monitoring owner, recipients/escalation and approved alert destination or explicit accepted manual posture |
| Synthetic Internal UAT Passed | Not Run | None yet | Execute/sign off all applicable journeys with release-bound evidence |
| Controlled Pilot Ready | Blocked | Not sufficient | Recovery proof, RPO/RTO, privacy/security/business approvals, support, device/field/provider and migration validation |
| Production Ready | Blocked | Not sufficient | Production infrastructure, providers, retention/cutover decisions, full recovery and production validation |

The machine-readable register is `config/readiness-gates.json`. A gate cannot be promoted because documentation exists; every required automated result, human approval and external dependency must have a durable reference.

