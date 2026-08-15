# Evidence-Based Readiness Gates

| Gate | Current result | Automated evidence | Human/external evidence still required |
|---|---|---|---|
| Shared Staging Ready | Passed | Protected deployment 31738092512, migrations, Functions/frontends, personas, authorization and remote smoke | Preserve repeatability |
| Synthetic Internal UAT Ready | Passed | Staging platform, catalogue, data/fake/capture contracts and approved monitoring ownership/route | Preserve environment controls; delivery proof is still required before Pilot |
| Synthetic Internal UAT Passed | Not Run | None yet | Execute/sign off all applicable journeys with release-bound evidence |
| Controlled Pilot Ready | Blocked | Isolated logical restore passed in run 31877345920 with a 296-second observed RTO; alert delivery passed in run 31878853824 with Shaun's human receipt confirmation | Independent recovery verification; achieved RPO or accepted exception; rollback/forward-repair evidence; synthetic UAT; privacy/security/business approvals; support, device/field/provider and migration validation |
| Production Ready | Blocked | Not sufficient | Production infrastructure, providers, retention/cutover decisions, full recovery and production validation |

The machine-readable register is `config/readiness-gates.json`. A gate cannot be promoted because documentation exists; every required automated result, human approval and external dependency must have a durable reference.

## Phase 5E execution status

- **Passed:** shared Staging; Synthetic Internal UAT readiness; isolated logical restore mechanics and automated integrity checks; observed RTO within four hours; controlled alert delivery with human mailbox confirmation.
- **Not Run:** Office/Driver/Edge Function rollback rehearsal and current-release restoration; database forward-repair rehearsal/tabletop; all six synthetic UAT journeys.
- **Blocked/pending human or external evidence:** Sidney's independent restore verification; one-hour RPO; 12-month evidence retention; Pilot and Production approvals/dependencies listed above.
