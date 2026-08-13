# UAT and Pilot Plan

**Status:** Phase 5A readiness plan; no pilot authorized
**Last reviewed:** 2026-08-13

## Entry criteria for internal UAT

- Isolated staging database, Auth, Functions and frontend hosting are reproducibly deployed.
- Production-like role/region permissions, MFA policy and named test users are configured.
- Synthetic staging dataset covers all roles, regions and negative cases.
- Communications remain capture/allowlist only; provider sandboxes cannot reach real clients.
- Monitoring, deployment rollback, migration recovery and initial-admin/user runbooks are exercised.
- Required fake providers are explicitly identified; selected staging sandboxes are isolated.

## End-to-end UAT catalogue

| Scenario | Actors | Provider mode | Acceptance evidence |
|---|---|---|---|
| Create and administer client/service/address | Office/Admin | None | Ownership, validation, audit and region denial |
| Receive website signup and activate client | Office/Admin | Fake/staging website adapter | Idempotent intake, match/review, authority transition |
| Import existing clients | Migration operator/reviewer | Synthetic approved extract | Profile, dry run, reconciliation, activation, rollback report |
| Build and lock Daily Roster | Operations Manager | None | Availability/substitution/conflict behavior |
| Generate, optimize, compare and publish routes | Planner | Fake first; chosen routing sandbox later | Eligibility, candidate rejection/fallback, immutable publication |
| Handoff and execute route offline | Office + Driver | Real staging devices/network shaping | Install, accept, offline stop actions, conflict/retry, completion |
| Track vehicle and review intelligence | Office + Driver/device | Browser trial and chosen GPS candidate | Accuracy, buffering, health, privacy, calibrated alerts |
| Sync accounting and reconcile client | Finance-authorized Office | Fake first; Zoho staging later | Idempotent facts, aging/freshness, failed-sync preservation |
| Apply/release financial hold | Authorized Office | Fake accounting | Versioned evidence, route exclusion, published-operation protection |
| Send/fallback communication and receive callback | Office | Capture/fakes; provider sandboxes later | Recipient safety, template, fallback, callback ordering/history |
| Receive SKIP, approve, replan and acknowledge | Office | Fake inbound/capture outbound | One occurrence only, immutable versions, late protection |
| Raise and resolve operational issue/Needs Attention | Office/Driver as scoped | None | Minimum disclosure, deduplication, audit |
| Security boundary suite | Every role | None | Driver/sensitive/cross-region/service-role denials |

Each scenario records build/commit, environment, seed version, actor/role, expected and actual result, defect link, evidence and sign-off. Fakes prove contracts; real staging providers and devices prove external behavior.

## Minimum safe controlled pilot

Recommended scope is one region, one collection team, one vehicle, named Office users, managed Driver device(s), and a limited explicitly consented client/service subset. Operate within a named support window with daily start/end checks and a parallel read-only/manual fallback. Do not include financial enforcement, live communications, or all-hours tracking unless their specific P0/P1 decisions and provider validations are complete.

### Pilot entry criteria

- All pilot-applicable P0 gaps are Validated or explicitly accepted by accountable owners.
- Migration subset is reconciled; no uncontrolled dual writes exist.
- Routes have been compared with known operations and driven safely in staging/shadow trials.
- Driver devices, authentication, offline recovery and support escalation are proven.
- Monitoring and alerts are watched by named owners; backup restore and deployment rollback are rehearsed.
- Privacy notices, access, retention and tracking posture are approved for the pilot.
- Office and Driver training is complete; provider contacts and fallback steps are available.

### Success criteria

- All planned collections remain accounted for; no silent exclusions or lost offline actions.
- Route publishing/handoff/history remain correct and recoverable.
- Driver can complete work through representative connectivity loss.
- Website/intake and migration records reconcile with the declared source of truth.
- Alerts reach owners and incidents follow the runbook.
- No unauthorized region, financial, communications or location disclosure occurs.
- Operational users confirm workflows are usable and exceptions are reviewable.

### Pause or rollback criteria

Pause on unexplained data divergence, authorization/privacy breach, unrecoverable Driver synchronization, unsafe routes, repeated missing collections, unowned critical alerts, failed backup/rollback capability, or provider failure without a practiced fallback. Rollback means stopping new Control Centre writes for pilot scope, preserving immutable evidence, returning to the declared fallback process and reconciling before resumption.

## Real-world validation register

- Android device/browser/install/update and optional iOS scope.
- Screen lock/background, battery, offline duration, storage pressure and clock skew.
- Representative urban/rural route geometry, travel times and optimization usability.
- GPS accuracy, cadence, lag, provider/device health and intelligence false positives.
- Office map and route workflows under expected concurrent use.
- Website duplicate/retry/outage behavior.
- Migration address/coordinate/duplicate/team/day/billing mapping workload.
- Zoho customer/credit/currency/aging behavior and rate limiting.
- Messaging sender/template/webhook/fallback behavior in sandboxes.
- SKIP cutoff, late request, replan and acknowledgement timing with operators.
- Synthetic scale/load scenarios defined in the assessment.
