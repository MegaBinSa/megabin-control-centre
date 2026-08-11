# ADR-008: Integration Adapter Pattern

**Status:** Accepted

## Context

Mapping, tracking, communications, accounting, website, and spreadsheet providers will evolve and have different data authority.

## Decision

Place every external integration behind a provider-neutral adapter. Declare its authority, permitted fields/actions, authentication, retries, idempotency, health, conflict behavior, retention, and decommission dependencies.

## Consequences

- Core business logic does not import provider SDKs directly.
- Provider identifiers and payloads remain at the boundary.
- External systems cannot write directly to the master database.

## Rejected alternatives

- Provider SDK calls scattered through modules.
- Shared database credentials for external systems.
- A generic plugin framework; explicit adapters are simpler and safer.

