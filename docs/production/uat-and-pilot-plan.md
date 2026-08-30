# UAT and Pilot Plan

**Status:** Shared Staging and Synthetic Internal UAT Ready gates passed; UAT-OFF-001, UAT-DRV-001 and UAT-WEB-001 passed, three journeys remain; no pilot authorized
**Last reviewed:** 2026-08-30

## Entry criteria for internal UAT

- Isolated Staging database, Auth, Functions and frontend hosting are reproducibly deployed (validated by run 31738092512).
- Synthetic Office/Driver users, application profiles, region/team scopes and positive/negative authorization smoke checks are proven.
- Extend the deterministic seed/personas where a UAT scenario requires roles or regions beyond the proven Office/Driver pair.
- Communications remain capture/allowlist only; provider sandboxes cannot reach real clients.
- Monitoring/alert delivery passed in run 31878853824. Isolated logical restore passed in run 31877345920 with a 296-second RTO; independent verification remains pending. Component rollback/current restoration passed in run 31881010706. Isolated forward repair passed in run 31906816621; independent post-run review remains pending. Before pilot, resolve or explicitly accept the unmet one-hour RPO and evidence-retention gap.
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

The Phase 5C remote smoke suite is infrastructure acceptance evidence, not business UAT sign-off. It proves the environment can host the UAT catalogue safely with synthetic data and fake/capture providers.

`config/synthetic-uat-catalogue.json` defines the six executable journey groups with stable IDs and mandatory evidence fields. `config/synthetic-uat-data.json` bounds preparation/recycling to synthetic provenance and preserves Phase 5C personas. `UAT-OFF-001` and `UAT-DRV-001` passed on Shared Staging release `c74bea8b7f09d572c9d1f12182d3082eca063de6`, covering region-scoped planning, immutable handoff/observation, offline synchronization, completion and Driver denial of Office, financial and master-data access. `UAT-WEB-001` passed after protected receipt, durable processing remediation, identical-submission retry, scoped review/approval and atomic regional activation, with final evidence on release `faf4be5d0b676f21bcd8f5d3cea584e860b78107`. Three journeys remain Not Run, so Synthetic Internal UAT Passed is not claimed.

Infrastructure and recovery assurance are sufficient to continue the synthetic journeys without implying Pilot readiness. Execute `UAT-SKP-001` next, following catalogue order, because website onboarding authority transition is now proven and the next untested cross-domain boundary is synthetic inbound SKIP through one-occurrence exclusion and protected replanning. The protected, secret-safe **Submit staging SKIP UAT inbound** mechanism is implemented but not executed. Its runtime/database changes require protected Shared Staging deployment before use. Before mutation, verify the reserved inbound identity is absent and prepare a future Monday occurrence plus a reviewed Published route through existing Office workflows. Continue one case at a time, retain release identity/tester evidence, and stop on any live-provider or real-data indication.

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
