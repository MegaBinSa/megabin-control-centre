# Domain Module Conventions

**Status:** Phase 0B-4 foundation

## Shape

Each module remains part of one deployable modular monolith. When implemented, a module should separate:

```text
module/
  domain/          entities, value objects, invariants, domain events
  application/     commands, queries, authorization, transaction orchestration
  infrastructure/  PostgreSQL repositories and provider-neutral technical adapters
  api/             transport mapping only
```

This is a logical boundary, not a requirement to create empty folders before a module exists.

## Dependency rules

- Domain code depends only on its own domain concepts and intentionally shared value types.
- Application code coordinates its own domain and stable read interfaces from permitted modules.
- Infrastructure implements ports defined inward; provider SDK types do not cross the adapter boundary.
- API handlers translate transport data into application commands and contain no business rules.
- A module never imports another module's repository implementation or modifies another module's tables.
- Cross-module cycles are resolved with an application orchestrator, read interface, or durable event.

The canonical module keys are exported from `@megabin/domain-types` and match the ownership map. Future module packages must enforce these directions through TypeScript project references and lint rules once real module code exists.

## Transaction boundary

The owning application service defines the transaction. It persists authoritative changes and associated outbox records atomically. External provider calls occur after commit through adapters unless an explicitly documented workflow requires another failure model.

## Deliberate exclusions

There is no generic repository abstraction, workflow engine, plugin framework, dependency-injection framework, or separate deployable service in this foundation. Abstractions are added only when an implemented domain needs them.
