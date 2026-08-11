# ADR-012: Monorepo Architecture

**Status:** Accepted

## Context

The two frontends, modular backend/domain code, Supabase configuration, shared contracts, tests, and architecture documentation must evolve coherently.

## Decision

Use one Control Centre monorepo containing separate applications, shared packages, backend modules, Supabase migrations/functions, tests, and documentation. The WordPress website remains a separate repository.

## Consequences

- Shared changes can be reviewed and tested atomically.
- Package and module boundaries require automated enforcement.
- Deployment targets remain independently buildable even though source is co-located.

## Rejected alternatives

- A repository per module: unnecessary coordination and versioning overhead.
- Placing the Control Centre inside the WordPress repository.

