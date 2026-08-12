# Architecture Index

**Status:** Authoritative navigation and document classification  
**Last reviewed:** 2026-08-11

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
| [Geography administration](geography-administration.md) | Phase 1C PostGIS, map boundary, priority, impact, and review contracts |
| [Daily Roster](daily-roster.md) | Phase 1D operational-day, availability, substitution, validation, and locking contracts |
| [Route Planning](route-planning.md) | Phase 2A route aggregate, eligibility, deterministic baseline, versioning, and publication |
| [Route Optimization](route-optimization.md) | Phase 2B provider boundaries, attempts, candidates, validation, and fallback |
| [Route Operations](route-operations.md) | Phase 2C handoff, manifests, assignments, Driver authorization, and offline actions |
| [Office master-data workflow](../workflows/office-master-data-administration.md) | Authenticated Office administration behavior |
| [Office geography workflow](../workflows/office-geography-administration.md) | Territory map editing and assignment-review workflow |
| [Office Daily Roster workflow](../workflows/office-daily-roster.md) | Daily planning, readiness, substitution, and lock workflow |
| [Office route optimization workflow](../workflows/office-route-optimization.md) | Provider status, candidate comparison, acceptance, rejection, and safe fallback |
| [Office Route Operations workflow](../workflows/office-route-operations.md) | Published handoff, operational visibility, and pre-start reassignment |
| [Office local development](../runbooks/office-local-development.md) | Local Auth, API, and browser-test workflow |
| [Master-data migration considerations](master-data-migration-considerations.md) | Import, identity, and transition constraints |
| [State-machine catalogue](state-machine-catalogue.md) | Implemented lifecycle states and transitions |
| [Environment strategy](environment-strategy.md) | Isolation of development, staging, and production |
| [Integration architecture](integration-architecture.md) | Adapter boundaries, reliability, and external-system rules |
| [ADR index](../adr/README.md) | Accepted architecture decisions and their status |

## Supporting and migration context

Files under [`docs/megabin-shared/`](../megabin-shared/README.md) describe the separate WordPress website, its current data, and existing integrations. They are evidence for future migration and integration work. They are not an approved Control Centre schema, API, module model, or runtime architecture.

## Documents planned for later Phase 0 work

- Data-retention matrix
- Development roadmap and operational runbooks
