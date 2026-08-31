# Production Readiness Assessment

**Status:** Authoritative assessment; updated through three passing synthetic UAT journeys

**Assessment baseline:** Phase 5A repository assessment plus validated shared-Staging and Phase 5E assurance evidence through release `c74bea8b7f09d572c9d1f12182d3082eca063de6`

**Assessment date:** 2026-08-25

## Executive conclusion

MegaBin Control Centre is now a deployed shared-staging platform suitable for structured synthetic internal UAT. It is not ready for a controlled pilot or production. The modular monolith, immutable operational history, private-schema persistence, RLS/API boundary, provider adapters, idempotency conventions, offline action model, audit/outbox foundations, generated OpenAPI, broad synthetic tests and protected deployment path are reusable launch foundations.

Shared Staging is proven end to end by [deployment run 31738092512](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31738092512): protected main-only release, migrations, hosted Data API configuration, application-owned persona authorization, Edge Functions, both frontends, release/CORS/auth boundaries, fake/capture providers, synthetic website intake and remote smoke checks all passed. Phase 5E additionally proved alert delivery, isolated logical restore within the four-hour RTO, compatible component rollback/current restoration and isolated immutable database forward repair without writing to shared Staging. Production providers remain intentionally inactive; real client migration, real-device operation, business UAT, privacy, retention, routine user/device management and support procedures remain unresolved. Browser geolocation cannot meet the stated all-hours vehicle-visibility requirement.

The project remains **Synthetic Internal UAT Ready**. Shared Staging is observable, its core logical recovery, component rollback and forward-repair mechanisms have been rehearsed, and `UAT-OFF-001`, `UAT-DRV-001`, `UAT-WEB-001` and `UAT-SKP-001` have Passed with release-bound evidence. Two UAT journeys remain Not Run, so the aggregate Synthetic Internal UAT Passed gate and every pilot/production gate remain unmet.

## Classification and stage definitions

Readiness labels used by this register are `READY`, `CONFIGURATION_REQUIRED`, `PROVIDER_REQUIRED`, `BUSINESS_DECISION_REQUIRED`, `SECURITY_HARDENING_REQUIRED`, `DEPLOYMENT_REQUIRED`, `DATA_MIGRATION_REQUIRED`, `REAL_WORLD_VALIDATION_REQUIRED`, `UAT_REQUIRED`, `DOCUMENTATION_REQUIRED`, `PRODUCTION_BLOCKER`, and `POST_LAUNCH`.

Priorities are: P0 blocks the stated next delivery stage; P1 is required before full production; P2 is important hardening or operational quality; P3 is a post-launch improvement. Delivery stages are Local Development, Shared Development/Staging, Internal UAT, Controlled Pilot, Production Cutover, and Post Launch.

## Evidence reviewed

The assessment covered all accepted ADRs and architecture documents; 20 versioned Supabase migrations; private/application/API schemas; RLS and permission tests; both Edge Functions; Office Web and Driver PWA; routing, optimization, Route Operations, tracking, live intelligence, onboarding, migration, accounting, financial eligibility, communications, and SKIP modules; background jobs, configuration, integrations, observability, CI, environment examples, browser tests, and available runbooks.

Current verification foundations comprise the repository quality/build pipeline, clean migration replay, pgTAP/RLS coverage, TypeScript integration tests, Playwright workflows, Deno checks, generated OpenAPI drift checking, application-schema lint/performance checks, documentation-link validation, secret/environment scans, and synthetic-data rules. These prove deterministic behavior; they do not prove provider, device, load, recovery, or human operational readiness.

## Readiness scorecard

Percentages are deliberately avoided because external configuration and real-world proof are not meaningfully additive.

| Domain | Status | Evidence and major blocker | Next action |
|---|---|---|---|
| Architecture/domain boundaries | Ready foundation | Modular monolith, ownership, API/write boundaries and ADRs are established | Preserve boundaries during deployment work |
| Database/migrations/RLS | Shared-staging, logical recovery and forward repair validated | Hosted migrations, Data API schema, personas and authorization boundaries passed; isolated logical restore completed in 296 seconds; isolated immutable forward repair passed in run 31906816621; one-hour RPO, PITR and production sizing remain unproven | Obtain independent evidence confirmations and close or accept the RPO gap |
| Office Web | Hosted in Staging; UAT required | Traceable Cloudflare deployment and authenticated smoke access passed | Run role-based synthetic UAT and usability review |
| Driver PWA | Hosted in Staging; field validation required | Traceable deployment and authenticated financial-isolation smoke checks passed; device/browser/background behavior is not proven | Real-device, poor-network and support rehearsal |
| Route planning/operations | Functionally ready; provider/calibration required | Deterministic baseline and protected immutable versions exist; live routing provider and operational calibration absent | Provider decision and route accuracy trial |
| Vehicle tracking | Pilot decision required | Ingestion, buffering and Office view exist; browser foreground geolocation cannot guarantee all-hours tracking | Select pilot/full-production tracking posture |
| Live operations intelligence | Calibration required | Rules and review workflow exist; thresholds are synthetic defaults | Shadow-mode pilot calibration |
| Website onboarding | Synthetic UAT passed; production integration required | Protected Shared-Staging receipt, durable processing, idempotent retry, scoped review/approval and atomic regional activation passed; production WordPress forwarder/cutover is not deployed | Build and stage WordPress adapter and fallback |
| Client migration | Data rehearsal required | Dry-run/reconciliation workflow exists; real dataset has not been profiled or imported | Sanitized profiling, then controlled dry runs |
| Accounting/Zoho | Provider required | Provider-neutral/fake contract exists; real Zoho adapter/OAuth is inactive | Approve semantics, implement and validate staging adapter |
| Financial eligibility | Business policy required | Versioned decisions, holds and route exclusion exist; production thresholds/authorities remain conservative | Approve policy before enforcement |
| Communications | Provider and policy required | Durable intents, fallback, templates and inbound foundation exist; only fake/capture mode is approved | Select providers, register identities/templates, staged test |
| Client SKIP | UAT and policy required | One-occurrence exclusion and protected replanning exist; cutoff/SLA/ownership unresolved | Approve conservative pilot policy and rehearse |
| CI/CD and hosting | Shared-staging and rollback validated | Protected main-only Supabase, Functions and Cloudflare deployment passed end to end; run 31881010706 proved compatible rollback and current restoration | Preserve gates; later design production approvals and equivalent rollback proof |
| Monitoring/support/DR | Restore, alert, component rollback and forward-repair proofs passed; remaining assurance pending | Runs 31877345920, 31878853824, 31881010706 and 31906816621 proved isolated restore, alert delivery, component rollback/current restoration and isolated immutable forward repair | Confirm recovery evidence independently; close unmet RPO and retention gaps |
| Security/privacy | Strong design; production approval required | Least-privilege architecture exists; MFA, scanning, privacy, retention and device policies incomplete | Security hardening and business/legal review |

## What is production-ready in structure

- PostgreSQL is the operational source of truth, with immutable IDs and versioned migrations.
- Private domain tables are reached through controlled application/API boundaries; frontends do not receive service-role credentials.
- Permission and region scope are tested across sensitive financial, communications, tracking and operational workflows.
- Route versions, manifests, financial decisions, communication attempts and SKIP exclusions preserve history and use optimistic concurrency/idempotency.
- Provider-neutral adapters and deterministic fakes prevent vendor types from leaking into domains and keep CI independent of live systems.
- Driver actions and GPS observations have bounded offline queues and server-side reauthorization.
- Non-production communications default to capture/allowlist safety.
- Audit, durable outbox, background-job, health, error/redaction and correlation conventions are consistently documented and exercised.

## Environment and Supabase readiness

Local Supabase remains explicitly development posture. Shared Staging now uses an isolated Supabase project, protected environment-specific credentials, hosted Data API configuration, deployed Functions, separate HTTPS frontend origins, synthetic Auth users and fake/capture provider gates. Production remains absent by design and must use separate projects, credentials, domains, webhooks, secrets and provider modes.

The protected Staging pipeline has proven migration preview/application/reconciliation, application-schema lint, deterministic seed, bounded persona provisioning, Function bundle/deployment, frontend deployment, release identity and remote smoke checks. Monitoring ownership/routing, recovery targets and objectives are approved. Recovery rehearsal #6 proved isolated logical restore and a 296-second observed RTO; Sidney's confirmation remains pending. Alert delivery and component rollback/current restoration also passed. Run 31906816621 proved the protected isolated-target forward-repair path, including the expected committed semantic fault, an immutable repair migration, post-repair integrity/security and zero shared-Staging writes. Sidney's post-run confirmation remains pending. Complete synthetic UAT next. The Free-plan one-hour RPO and 12-month evidence retention remain unmet.

Current Supabase guidance requires treating backups and stored objects separately and validating restores rather than equating backup availability with recovery. The chosen plan tier, retention, PITR option, compute requirements and outage during restore must be recorded during provisioning.

## Authentication, provisioning and permissions

Supabase Auth plus application-controlled permissions and region/team scope is the correct model. Production gaps are operational: no documented bootstrap administrator, invite/provision/deprovision flow, approved default role bundles, MFA rollout, password/session policy, device registration process, departure checklist or lost-device revocation procedure. The blueprint requires MFA for Director/Admin and System Admin/Developer; local Auth configuration does not implement production policy.

Role assignment must remain a privileged application operation. System Admin/Developer must not inherit financial or message-content access merely through technical responsibility. Operations Manager and Office financial/hold/communications authorities require business approval. Driver access must remain assignment-scoped and exclude accounting, financial reasoning, communication content and SKIP history. A targeted authorization penetration test should complement existing positive/negative RLS tests before pilot.

## Provider and integration readiness

- **Routing/optimization:** deterministic fake adapters and fallback are complete. Production capabilities, route-size limits, traffic/static-road needs, South African coverage, geocoding quality, data handling, latency, rate limits, cost and contractual posture are unselected. Real-road accuracy and 50–80-stop trials are pilot blockers if automated optimization is in pilot scope.
- **Vehicle tracking:** no external provider is selected. Browser/PWA foreground geolocation is suitable for a bounded supervised experiment, not an all-hours guarantee.
- **Website:** the Control Centre endpoint and contract exist. The live WordPress local-save-first forwarder, signing secret rotation, retry queue, source submission IDs, production endpoint, staging path and coexistence/cutover procedure still need implementation outside this repository or in its approved integration boundary.
- **Accounting:** fake Zoho behavior is comprehensive, but live organization ID, data center, OAuth app, scopes, token lifecycle, rate-limit handling validation, customer semantics, currency/credit/aging rules and production adapter activation are unresolved.
- **Communications:** no WhatsApp, SMS or email provider is committed. Sender identities, WhatsApp Business/template approval, SMS identity, email domain/DNS, webhooks, consent, delivery semantics, cost controls, live-mode approvals and retention require decisions and staged validation.

## Driver PWA and tracking assessment

The PWA has installability, app-shell service-worker caching, IndexedDB manifest/action/location queues, idempotent ordered synchronization, explicit conflicts, logout clearing and bounded GPS buffering. API traffic is intentionally not cached. Real readiness still requires HTTPS hosting; supported Android/browser/device matrix; install/update tests; expired-session/offline recovery; low-storage, battery, intermittent-network and device-loss tests; mobile ergonomic UAT; and support instructions. iOS should be either validated and supported or explicitly excluded.

### Tracking option decision matrix

| Option | Locked/background reliability | Battery/offline | Deployment and cost | Privacy/device control | Suitable posture |
|---|---|---|---|---|---|
| Browser/PWA | Low; OS may suspend | Moderate, existing bounded buffer | Lowest complexity/cost | Limited management | Supervised pilot only if foreground use is accepted |
| Native wrapper | Medium; platform restrictions remain | Better background APIs; engineering required | Moderate | Can add permissions/device controls | Candidate where existing PWA reuse is important |
| Dedicated native app | Medium-high with OS-compliant services | Strong buffering; tuning required | Higher build/support cost | Better device policy hooks | Candidate for managed phones |
| Managed Android agent | High on managed devices | Strong; MDM and battery policy required | Device-management overhead | Strong device ownership/revocation | Strong candidate for company-owned fleet phones |
| Third-party fleet tracker | High if provider/device proven | Independent vehicle power/offline store | Subscription/integration | Processor contract and access controls | Candidate for fastest reliable fleet rollout |
| Dedicated GPS hardware | Highest vehicle-centric reliability | Vehicle-powered/store-and-forward | Hardware/install/maintenance | Clear vehicle identity; vendor custody | Best fit for strict all-hours requirement |

The browser option can support a controlled pilot only if MegaBin explicitly accepts foreground-only limitations and parallel fallback. A reliable all-hours requirement makes an external/managed/native decision a full-production blocker.

## Live intelligence calibration register

| Setting | Repository posture | Pilot approach | Approval need |
|---|---|---|---|
| Stop arrival/departure radius | Typed configurable rule | Shadow results against observed stops | Operations approval after trial |
| Dwell time | Typed configurable rule | Tune by service outcome and site type | Operations approval |
| Route corridor tolerance | Typed configurable rule | Compare GPS accuracy and road geometry | Operations approval |
| Stationary threshold | Typed configurable rule | Shadow alert only initially | Operations approval |
| Late-start tolerance | Typed configurable rule | Provisional pilot default | Business approval |
| Falling-behind threshold | Typed configurable rule | Provisional, non-punitive alerts | Operations approval |
| Outside-hours grace | Typed configurable rule | No enforcement until working hours approved | Business/privacy approval |
| Unexpected-area threshold | Typed configurable rule | Shadow mode due privacy/false-positive risk | Business/privacy approval |
| GPS accuracy floor | Typed configurable rule | Calibrate per chosen device/provider | Technical/operations approval |
| Deduplication windows | Deterministic foundation | Validate against real update cadence | Technical approval |

## Performance and load-test plan

Correctness is well covered; production performance is not proven. Staging tests should use synthetic data and record p50/p95/p99 latency, failure rate, database utilization, queue lag and recovery:

1. 1,500 clients with realistic contacts, addresses, services, region/territory distribution and history.
2. Morning generation and optimization for 4–6 teams with 50–80 stops per team, including stale/replan and provider failure paths.
3. GPS at 30–60 second intervals for active vehicles, offline bursts, current-position refresh and intelligence evaluation for a full operating day.
4. Concurrent Office maps, route views and Driver sync under the expected user count.
5. Full and incremental accounting sync with pagination, rate limiting, reconciliation backlog and failed-run recovery.
6. Communication fan-out with WhatsApp/SMS/email fallback, callbacks and provider throttling in sandbox/capture mode.
7. Migration dry-run, reconciliation and activation in bounded batches at expected source volume.

## Security and privacy readiness

Existing RLS, API authorization, private schemas, webhook verification foundations, redaction rules and secret scans are strong. Missing production proof includes dependency alerts, SAST, repository secret protection, abuse/rate-limit tests, webhook spoof/replay tests, PWA local-storage review, session/MFA testing, integration-secret rotation rehearsal and a focused RLS/API penetration exercise.

Business/legal review is required for POPIA-related processing of client identities, addresses, contacts, financial records, communications and staff/vehicle location. Decisions must cover purpose and notice, processors and cross-border handling, least-privilege viewers, all-hours tracking, after-hours access, company versus personal devices, retention, correction/access requests, archival/deletion, legal holds, lost devices and employee departure. This document is an operational checklist, not legal advice.

## Monitoring, incident response and recovery

Phase 5D adds stable alert IDs, severity, deduplication, response expectations and private scheduled-monitor evidence for frontend/runtime/onboarding availability, release identity, Auth/authorization and fake/capture posture. Controlled proof run 31878853824 demonstrated the intended synthetic failure and produced valid evidence after every normal check resolved; Shaun human-confirmed the GitHub Actions email at `infomegabin@gmail.com`. This proves the approved Staging alert route, not programmatic mailbox observation or a complete production monitoring service. Broader production monitoring must still cover database health, outbox/job backlog, provider failures, GPS lag, stale intelligence, accounting/communications and migration failures.

Recovery has approved source/target, RPO/RTO and authorities plus fail-closed logical restore, rollback and forward-repair controls. [Run 31877345920](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31877345920) restored the Staging logical snapshot into the isolated project in 296 seconds and passed integrity/authorization checks. [Run 31881010706](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31881010706) deployed a compatible prior application release and restored current main with complete smoke verification and no database migration or downgrade. [Run 31906816621](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31906816621) applied the approved synthetic fault and separate forward repair only to the isolated target, then passed semantic, restored-data, authorization and RLS verification while shared Staging remained read-only. Sidney's independent restore and forward-repair evidence confirmations remain pending. Free-plan Staging has PITR disabled, no retained hourly snapshots and therefore does not achieve the one-hour RPO.

## Legacy coexistence principles

During pilot, existing spreadsheets and operational processes should remain a controlled read-only/parallel fallback, not a second writable master. Define a freeze point and system of record per data category; prohibit uncontrolled dual writes; reconcile pilot outputs daily; record fallback use; retain original migration/intake evidence; and retire legacy processes only after acceptance and reconciliation criteria pass.

## Critical path

### To controlled pilot

1. **Operational assurance and recovery:** independently confirm the passed restore and forward-repair artifacts; resolve the unmet hourly-RPO and 12-month evidence-retention gaps. Alert delivery, component rollback and isolated forward repair are proven.
2. **Structured synthetic UAT:** run the complete business-loop catalogue on the validated Staging release, recording actor, role, evidence and defects.
3. **Security/privacy and operating-policy closure:** approve roles, MFA, tracking/privacy, retention, support and incident ownership.
4. **Provider and tracking decisions:** choose pilot routing and GPS posture; choose only the other providers included in pilot scope.
5. **Integration/data rehearsal:** stage WordPress forwarding, profile migration data under approved privacy controls, dry-run imports and validate only selected provider sandboxes.
6. **Performance and device evidence:** run scale scenarios, Android/poor-network PWA trials and route-accuracy tests.
7. **Bounded pilot:** one region/team/vehicle, named users, limited clients, parallel fallback, daily reconciliation and explicit stop/rollback criteria.

### To full production

Close every P0/P1 applicable to the agreed launch scope; activate and validate live providers; migrate/reconcile authoritative data; complete training and user/device provisioning; approve financial, communications, SKIP, tracking and retention policies; test backup restore and deployment rollback; establish support/on-call ownership; freeze legacy writes; execute signed cutover/smoke/reconciliation steps; and retain a time-bounded read-only legacy fallback.

## Current Phase 5E next activity

The approved monitoring/recovery decisions are recorded, and alert delivery, restore, component rollback/current restoration and isolated forward repair have executed successfully. `UAT-OFF-001`, `UAT-DRV-001`, `UAT-WEB-001` and `UAT-SKP-001` have Passed. Execute `UAT-FIN-001` next with fake accounting and financial automation disabled, then execute `UAT-TRK-001` through the same release-bound evidence contract.

Phase 5E should remain synthetic and must not connect production providers, import real client data, enable live messaging/holds or launch a pilot. Its exit criterion is actual, release-bound operational/recovery/UAT evidence—not merely configured tooling.

## Related registers

- [Production gap register](production-gap-register.md)
- [Business decision register](business-decision-register.md)
- [Provider decision register](provider-decision-register.md)
- [Production configuration register](production-configuration-register.md)
- [UAT and pilot plan](uat-and-pilot-plan.md)
- [Cutover readiness](cutover-readiness.md)
- [Phase 5C staging deployment evidence](staging-deployment-evidence.md)
- [Recovery objectives register](recovery-objectives-register.md)
- [Readiness gates](readiness-gates.md)
