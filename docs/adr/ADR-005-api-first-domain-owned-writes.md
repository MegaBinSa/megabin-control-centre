# ADR-005: API-First and Domain-Owned Write Operations

**Status:** Accepted

## Context

Business invariants and module ownership cannot depend on frontend behavior or arbitrary direct table writes.

## Decision

Use versioned application interfaces from the start. Important state changes, privileged operations, and cross-module writes go through the owning module/application layer. Direct frontend Supabase access is limited to explicitly approved RLS-protected read models or simple operations fully authorized at the database boundary.

## Consequences

- API contracts are versioned and machine-readable.
- Frontends do not become the enforcement point for business rules.
- Direct database access remains exceptional and documented.

## Rejected alternatives

- Unrestricted frontend CRUD against operational tables.
- Provider-specific endpoints embedded in domain logic.

