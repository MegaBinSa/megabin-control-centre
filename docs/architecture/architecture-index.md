# Architecture Index

**Status:** Authoritative navigation and document classification  
**Last reviewed:** 2026-08-13

## Authority order

When documents conflict, use this order:

1. The [MegaBin Control Centre system blueprint](megabin-control-centre-system-blueprint.md).
2. Accepted [Architecture Decision Records](../adr/README.md).
3. The focused architecture documents listed below.
4. Legacy/source context under [`docs/megabin-shared/`](../megabin-shared/README.md).

Material changes to the architecture require an ADR. An ADR may clarify the blueprint but must explicitly identify any approved deviation from it.

## Authoritative architecture documents

| Document | Purpose |
|---|---|
| [System blueprint](megabin-control-centre-system-blueprint.md) | Product and architecture source of truth |
| [Domain model](domain-model.md) | High-level entities and relationships |
| [Module dependency map](module-dependency-map.md) | Module ownership, reads, writes, and dependency direction |
| [Data ownership matrix](data-ownership-matrix.md) | Authority across the Control Centre and external systems |
| [Security and RLS model](security-and-rls-model.md) | Identity, authorization, RLS, and privileged-access principles |
| [Permissions matrix](permissions-matrix.md) | Granular permission and access-scope foundation |
| [API conventions](api-conventions.md) | Versioning, errors, write boundaries, and retry-safe request rules |
| [Domain module conventions](domain-module-conventions.md) | Internal modular-monolith layers and dependency enforcement |
| [Event catalogue](event-catalogue.md) | Domain-event envelope, evolution, and outbox lifecycle |
| [Idempotency conventions](idempotency-conventions.md) | Duplicate handling for APIs, offline actions, webhooks, and consumers |
| [Configuration and feature flags](configuration-and-feature-flags.md) | Typed environment configuration, safe flags, secrets separation, and change history |
| [Integration lifecycle](integration-lifecycle.md) | Provider-neutral adapter lifecycle, modes, health, and decommissioning |
| [Observability and error conventions](observability-and-error-conventions.md) | Trace context, structured logs, error taxonomy, and redaction |
| [Offline synchronization contract](offline-sync-contract.md) | Future device actions, duplicate outcomes, and generic conflicts |
| [Technical retention rules](technical-retention-rules.md) | Retention and deletion boundaries for diagnostic records |
| [System health and background jobs](system-health-and-background-jobs.md) | Health checks, job identity, concurrency, retries, and cancellation |
| [Backend runtime architecture](backend-runtime-architecture.md) | Executable modular-monolith shell and synthetic proof boundary |
| [Transaction conventions](transaction-conventions.md) | Atomic state, idempotency, audit, and outbox behavior |
| [Outbox dispatcher operations](outbox-dispatcher-operations.md) | Claim, publish, retry, dead-letter, and replay lifecycle |
| [Background-job runtime](background-job-runtime.md) | Bounded job execution and durable-state adapter contract |
| [Health endpoints](health-endpoints.md) | Liveness, readiness, and safe platform health response |
| [Master-data API](master-data-api.md) | Phase 1B authenticated administration contracts and write boundary |
| [Office Web navigation](office-web-navigation.md) | Stable workspace routes, History navigation, auth-refresh separation, dirty forms, and stale-request isolation |
| [Geography administration](geography-administration.md) | Phase 1C PostGIS, map boundary, priority, impact, and review contracts |
| [Daily Roster](daily-roster.md) | Phase 1D operational-day, availability, substitution, validation, and locking contracts |
| [Route Planning](route-planning.md) | Phase 2A route aggregate, eligibility, deterministic baseline, versioning, and publication |
| [Route Optimization](route-optimization.md) | Phase 2B provider boundaries, attempts, candidates, validation, and fallback |
| [Route Operations](route-operations.md) | Phase 2C handoff, manifests, assignments, Driver authorization, and offline actions |
| [Driver PWA execution](driver-pwa-execution.md) | Phase 3A installable app, offline cache and queue, stop outcomes, completion, and Office progress |
| [Vehicle Tracking](vehicle-tracking.md) | Phase 3B devices, assignments, GPS ingestion, current positions, health, privacy, and retention |
| [Live Operations Intelligence](live-operations-intelligence.md) | Phase 3C reviewable derived facts, deterministic inference, Needs Attention, and live progress |
| [Website Intake](website-intake.md) | Phase 4A immutable signup intake, matching, review, activation, and authority transition |
| [Website integration contract](website-integration-contract.md) | Provider-neutral payload, authentication, idempotency, acknowledgement, and WordPress adapter guidance |
| [Client Migration](client-migration.md) | Immutable batches, canonical mapping, reconciliation, dry-run, activation, provenance, and recovery |
| [Accounting Integration](accounting-integration.md) | Provider facts, reconciliation, snapshots, status, freshness, and eligibility boundary |
| [Accounting provider contract](accounting-provider-contract.md) | Provider-neutral sync, failure, pagination, and secret boundary |
| [Zoho Books adapter](zoho-books-adapter.md) | Fake-adapter posture and production activation steps |
| [Office master-data workflow](../workflows/office-master-data-administration.md) | Authenticated Office administration behavior |
| [Office geography workflow](../workflows/office-geography-administration.md) | Territory map editing and assignment-review workflow |
| [Office Daily Roster workflow](../workflows/office-daily-roster.md) | Daily planning, readiness, substitution, and lock workflow |
| [Office route optimization workflow](../workflows/office-route-optimization.md) | Provider status, candidate comparison, acceptance, rejection, and safe fallback |
| [Office Route Operations workflow](../workflows/office-route-operations.md) | Published handoff, operational visibility, and pre-start reassignment |
| [Driver route execution workflow](../workflows/driver-route-execution.md) | Assigned-route download, offline field actions, synchronization, and completion |
| [Office vehicle tracking workflow](../workflows/office-vehicle-tracking.md) | Regional live map/status and tracking-device administration |
| [Office Live Operations workflow](../workflows/office-live-operations.md) | Regional intelligence, evidence review, and false-positive dismissal |
| [Office Website Intake workflow](../workflows/office-website-intake.md) | Signup comparison, approval, rejection, and activation workflow |
| [Office Client Migration workflow](../workflows/office-client-migration.md) | Import, profile, reconcile, dry-run, review, activation, and reporting |
| [Office Accounting workflow](../workflows/office-accounting.md) | Provider health, sync, reconciliation, account detail, and exceptions |
| [Office local development](../runbooks/office-local-development.md) | Local Auth, API, and browser-test workflow |
| [Master-data migration considerations](master-data-migration-considerations.md) | Import, identity, and transition constraints |
| [State-machine catalogue](state-machine-catalogue.md) | Implemented lifecycle states and transitions |
| [Environment strategy](environment-strategy.md) | Isolation of development, staging, and production |
| [Staging environment](staging-environment.md) | Staging identity, isolation, safety posture, and external prerequisites |
| [Deployment architecture](deployment-architecture.md) | Protected staging release sequence, artifacts, traceability, and production deferral |
| [Operational assurance](operational-assurance.md) | Monitoring evidence, isolated recovery, rollback and synthetic UAT boundaries |
| [Environment configuration guide](environment-configuration-guide.md) | Configuration/secret stores, validation, drift, and safety gates |
| [Integration architecture](integration-architecture.md) | Adapter boundaries, reliability, and external-system rules |
| [Financial eligibility](financial-eligibility.md) | Service financial decisions, holds, precedence, and route contract |
| [Client Communications](client-communications.md) | Intents, attempts, fallback, templates, environment safety, inbound normalization, and privacy |
| [Client SKIP Workflow](client-skip-workflow.md) | One-occurrence qualification, approval, exclusion, replanning, protection, and acknowledgement |
| [Messaging provider contract](messaging-provider-contract.md) | Provider-neutral adapter and secure webhook boundary |
| [Office Communications workflow](../workflows/office-communications.md) | Test sends, delivery history, provider health, and inbound review |
| [ADR index](../adr/README.md) | Accepted architecture decisions and their status |
| [Production readiness assessment](../production/production-readiness-assessment.md) | Phase 5A launch-readiness assessment, scorecard, gaps, and critical path |
| [Production gap register](../production/production-gap-register.md) | Stable production gap IDs, classifications, priorities, blockers, and actions |
| [Business decision register](../production/business-decision-register.md) | Consolidated unresolved business and policy decisions |
| [Provider decision register](../production/provider-decision-register.md) | Provider capabilities, selection criteria, blockers, and adapter posture |
| [Production configuration register](../production/production-configuration-register.md) | Environment configuration and secret inventory without values |
| [UAT and pilot plan](../production/uat-and-pilot-plan.md) | End-to-end UAT, field validation, and bounded pilot gates |
| [Cutover readiness](../production/cutover-readiness.md) | Production gates, coexistence, cutover, rollback, and support outline |
| [Phase 5C staging deployment evidence](../production/staging-deployment-evidence.md) | Validated release, protected deployment controls, remote smoke proof, and remaining assurance gaps |
| [Recovery objectives register](../production/recovery-objectives-register.md) | Explicit RPO/RTO, backup/PITR, authority and isolated-target decisions |
| [Forward-repair rehearsal](../production/forward-repair-rehearsal.md) | Protected isolated-target semantic-failure and immutable forward-repair mechanism |
| [Readiness gates](../production/readiness-gates.md) | Evidence-based Staging, UAT, Pilot and Production gates |
| [Phase 5D assurance evidence](../production/phase-5d-assurance-evidence.md) | Verification obtained, evidence not obtained, and explicit blockers |
| [Phase 5E assurance evidence](../production/phase-5e-assurance-evidence.md) | Approved decisions, executable rehearsal controls, and truthful execution boundary |
| [Alert delivery evidence](../production/alert-delivery-evidence.md) | Controlled notification proof and human receipt requirement |
| [Restore rehearsal evidence](../production/restore-rehearsal-evidence.md) | Logical restore/RTO evidence and unresolved RPO posture |
| [Rollback rehearsal evidence](../production/rollback-rehearsal-evidence.md) | Prior-release and forward-repair rehearsal evidence |
| [Synthetic UAT results](../production/synthetic-uat-results.md) | Release-bound results for the six operational journeys |
| [Operations runbook index](../runbooks/README.md) | Deployment, recovery, provisioning, monitoring, incident, device, reset, and release procedures |

## Supporting and migration context

Files under [`docs/megabin-shared/`](../megabin-shared/README.md) describe the separate WordPress website, its current data, and existing integrations. They are evidence for future migration and integration work. They are not an approved Control Centre schema, API, module model, or runtime architecture.

## Planned documentation

- Approved production data-retention policy after business/privacy review
- Deployment, recovery, incident, user-management, device-management, and operating runbooks
