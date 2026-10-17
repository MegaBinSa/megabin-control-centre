# Synthetic UAT sign-off and pilot-entry decision packet

**Prepared:** 2026-10-17, Africa/Johannesburg.

**Decision status:** Approved by the project user; recorded `2026-10-17T19:56:09Z` (21:56:09 SAST).

**Current stage:** Synthetic Internal UAT Passed. Pilot and production gates remain Blocked.

## Approved decision

The project user explicitly accepted completion of the six synthetic Shared-Staging journeys below, including the packet's recorded scope and limitations, and authorized the evidence merges. Approval permits recording the aggregate **Synthetic Internal UAT Passed** gate and merging the reviewed evidence/tooling PRs in dependency order after their final checks pass.

This decision covers the completed synthetic catalogue. Pilot operation, deployment, real customer data, live providers/messages, financial enforcement and continuous/background employee tracking require their separate approvals and evidence. No additional staging business mutation or UAT fixture replay is part of this decision.

| Decision | Current record |
|---|---|
| Human approver and approval statement | Project user, explicit response: “Approve synthetic UAT and evidence merges” |
| Approval record time and source | `2026-10-17T19:56:09Z`, recorded from the explicit user response in the project Codex conversation on 2026-10-17 |
| Aggregate UAT gate | `Passed`; its human sign-off requirement is fulfilled by that response |
| Controlled Pilot Ready | `Blocked`; independent entry requirements below remain open |
| Production Ready | `Blocked` |

The approval question explicitly covered the six completed journeys in this packet and merging PR #97 followed by #99 after final CI. It explicitly retained pilot-operation and deployment approval as separate decisions. PR #97 subsequently merged at `2026-10-17T19:56:41Z` as `136aeff9cf95658d184f2874c56044a3ec534eef`; PR #99 retains its own final integration and CI record on GitHub.

## Six completed journeys

| Case | Evidence and tester | What passed | Practical limit |
|---|---|---|---|
| `UAT-OFF-001` | [Office execution](synthetic-uat-results.md#uat-off-001--passed), Shaun | Regional planning, roster/date restoration, reviewed publication/handoff, preserved completed operation and Driver financial isolation | Synthetic workflow evidence; operational usability and field trials remain separate |
| `UAT-DRV-001` | [Driver execution](synthetic-uat-results.md#uat-drv-001--passed), Shaun | Assigned route, offline Accept/reconnect, scheduled Start, cleaned/two-drum stop, capacity and completion, independently confirmed by Office | Real-device/browser/install/background/session-loss matrix remains open |
| `UAT-WEB-001` | [Website execution](synthetic-uat-results.md#uat-web-001--passed), Shaun | Protected receipt, durable processing, exact retry, scoped approval and atomic activation | Production WordPress forwarding, coexistence and cutover remain open |
| `UAT-SKP-001` | [SKIP execution](synthetic-uat-results.md#uat-skp-001--passed), Shaun | Matched fake inbound, near-cutoff review, one-occurrence exclusion, capture-only acknowledgement and protected Draft replan | Production cutoff/SLA/channel policy and live communications remain open |
| `UAT-FIN-001` | [Financial completion](uat-fin-001-completion.md), Codex under explicit user-approved mappings/decisions | Two mapped fake snapshots, three advisory decisions, authenticated Office deep link/reload, Driver denial, exact idempotent replay and protected operational state | No real accounting integration or approved enforcement policy; holds/jobs stayed zero, automation off |
| `UAT-TRK-001` | [Tracking completion](uat-trk-001-completion.md), Codex under user instruction | Synthetic GPS receipts/ordering, actual PWA offline reload/reconnect/logout, regional/Driver denials, reviewed/resolved retrospective intelligence and unchanged Driver truth | Fixed synthetic positions and historical completion classification; no all-hours or real-device/calibration claim |

The catalogue retains each case's exact release, execution time and tester. The earlier four cases ran on their recorded historical releases; they were not all rerun on the current release. Financial and Tracking hosted executions used main release `7d102000b49e02e7387bdd07210e46563a53c54d`, deployment `github-39059933828-1`. Current regression CI covers the repository on the reviewed evidence revisions; it does not replace real-device or business acceptance.

## Technical evidence review

Codex reviewed the exact PR scopes, manual workflow gates, fixed fixtures, request allowlists, identity/scope assertions, retained outcomes and protected-state reconciliation. This is an author/agent technical review, not independent human approval or a separate security audit.

| PR | Reviewed execution/tooling revision | CI evidence | Review result |
|---|---|---|---|
| [#97 Financial evidence](https://github.com/MegaBinSa/megabin-control-centre/pull/97) | `300febed2eb1a86e30516a4003db3fbfa8e64769` | [Quality/database 39060658046](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39060658046), [security 39060658128](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39060658128), hosted preparation/verification and exact replay linked in the completion record | No blocking issue found for retaining this bounded synthetic evidence/tooling |
| [#99 Tracking evidence](https://github.com/MegaBinSa/megabin-control-centre/pull/99) | `1e56f90644a8645be4b263a5b2dc0c23364e5735`, before this decision-packet addition | [Quality/database 39064026909](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39064026909), [security 39064026918](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39064026918), [hosted execution 39063525813](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/39063525813) | No blocking issue found for retaining this bounded synthetic evidence/tooling; final document/sign-off edits require green checks before merge |

The latest full checks at review passed 250 unit tests, 53 Playwright tests, 763 database/RLS assertions, builds, Edge Function checks, CodeQL and dependency audit. New hosted jobs are manual-only, use the protected staging Environment and shared concurrency boundary, verify the deployed green main release and use existing application APIs/permissions. Application code, migrations and deployment configuration are outside these two PRs. Their new manual jobs must not be dispatched again merely to merge evidence.

Financial and Tracking records retain the initial failures and successful retests. Complete-record reconciliation preserved Published Route Versions, Route Operations and Driver stop outcomes; the Tracking journey also preserved Financial decisions. Financial holds/jobs remained zero. Review of artifact handling found sanitized JSON and synthetic screenshots, with credentials kept out of evidence. GitHub artifact retention remains 90 days; the separate 12-month assurance target is still unmet.

## Integration sequence after approval

1. Record the human decision, approval source/time and scope; only then clear the aggregate UAT gate's human-approval requirement. Leave pilot/production gates Blocked.
2. Confirm final checks and immutable head revisions for both PRs. Merge #97 first. Preserve #99's dependency history or update its base onto main without duplicating or losing the Financial changes; resolve any ordinary integration conflict and rerun the required checks.
3. Merge #99 only when its final main-based comparison and required checks pass. Retain the original execution/verifier SHAs as historical evidence, distinct from merge commits.
4. Verify main CI and the resulting catalogue/gates. Do not dispatch a deployment, replay synthetic mutations or activate a provider as part of evidence integration.

## Controlled-pilot entry checklist

These are outstanding requirements from the [readiness register](../../config/readiness-gates.json), [gap register](production-gap-register.md) and [pilot plan](uat-and-pilot-plan.md). They are work/decision items, not approvals supplied by this packet. Roles are existing ownership categories; named accountable owners and dates still need to be assigned.

| Order | Required decision or proof | Owner role | Evidence needed to close |
|---|---|---|---|
| 1 | Name the pilot sponsor/operations/technical owners; synthetic UAT sign-off is now complete | Business / Operations | Named decision owners, support window and escalation contacts (`PRD-SUP-001`, `PRD-OPS-002`); retain the completed `PRD-UAT-001` approval above |
| 2 | Freeze a small pilot scope and its source of truth | Business / Operations / Technical | Region, team, vehicle, named users/device, consented service subset, dates and fallback; explicit inclusion/exclusion of optimization, onboarding, accounting, messaging and financial enforcement |
| 3 | Approve role/device/privacy posture before real people or data enter | Business / Privacy / Technical | Role/region authority matrix; MFA/session revocation and departure/device-loss rehearsal; approved notices, consent/access and retention/tracking posture (`PRD-AUTH-001`, `PRD-SEC-001`, `PRD-PRI-001`) |
| 4 | Prove managed Driver hardware and connectivity behavior | Operations / Technical | Named Android/browser/device matrix; install/update, offline/session recovery, screen-lock/background, battery/storage/clock and loss tests; supervised tracking choice (`PRD-DRV-001`, `PRD-GPS-001/002`) |
| 5 | Reconcile the pilot data subset and safe route/provider path | Operations / Data / Technical | Approved source profile, repeated migration dry runs and reconciliation; no uncontrolled dual writes; known-route/shadow comparison and validation of any in-scope provider (`PRD-DAT-001/002`, conditional `PRD-PRV-001` and `PRD-WEB-001`) |
| 6 | Complete recovery and evidence-storage obligations | Technical / accountable recovery owner | Sidney's independent recovery confirmations; achieved one-hour RPO or explicit accountable pilot exception; durable evidence archive or documented outstanding retention decision (`PRD-DR-001`) |
| 7 | Rehearse operation, support and stop conditions | Operations / Technical / Business | Named alert watchers, trained Office/Driver users, incident/fallback rehearsal and approved pause/rollback criteria; targeted authorization testing (`PRD-OPS-002`, `PRD-SEC-002`, `PRD-TRN-001`) |
| 8 | Make a separate pilot go/no-go decision | Accountable Business / Operations / Technical owners | Every pilot-applicable P0 requirement validated or explicitly accepted by its owner; frozen scope, dates, support coverage and stop criteria recorded; only then consider `GATE-PILOT-READY` |

Recommended scope for that later decision remains one region, one team, one vehicle, named Office users and managed Driver hardware, limited consented services, a supervised support window and practiced manual fallback. Keep live client messaging, automated financial enforcement and any all-hours tracking promise outside that proposed scope until separately approved and validated. This recommendation authorizes no field test or pilot start.
