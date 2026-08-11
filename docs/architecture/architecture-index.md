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
| [Environment strategy](environment-strategy.md) | Isolation of development, staging, and production |
| [Integration architecture](integration-architecture.md) | Adapter boundaries, reliability, and external-system rules |
| [ADR index](../adr/README.md) | Accepted architecture decisions and their status |

## Supporting and migration context

Files under [`docs/megabin-shared/`](../megabin-shared/README.md) describe the separate WordPress website, its current data, and existing integrations. They are evidence for future migration and integration work. They are not an approved Control Centre schema, API, module model, or runtime architecture.

## Documents planned for later Phase 0 work

- State-machine catalogue
- Data-retention matrix
- Development roadmap and operational runbooks
