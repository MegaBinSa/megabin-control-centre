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
| [Environment strategy](environment-strategy.md) | Isolation of development, staging, and production |
| [Integration architecture](integration-architecture.md) | Adapter boundaries, reliability, and external-system rules |
| [ADR index](../adr/README.md) | Accepted architecture decisions and their status |

## Supporting and migration context

Files under [`docs/megabin-shared/`](../megabin-shared/README.md) describe the separate WordPress website, its current data, and existing integrations. They are evidence for future migration and integration work. They are not an approved Control Centre schema, API, module model, or runtime architecture.

## Documents planned for later Phase 0 work

- Permissions matrix
- State-machine catalogue
- Event catalogue
- API conventions
- Data-retention matrix
- Offline synchronization contract
- Observability and error conventions
- Development roadmap and operational runbooks

