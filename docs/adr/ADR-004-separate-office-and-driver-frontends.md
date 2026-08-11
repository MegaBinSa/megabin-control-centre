# ADR-004: Separate Office and Driver Frontends

**Status:** Accepted

## Context

Office staff and field teams have materially different workflows, data sensitivity, connectivity, device, and offline requirements.

## Decision

Create separate Office Web and Driver/Team PWA applications in the monorepo. They may share design-system, validation, domain-contract, API-client, and permission utilities.

## Consequences

- Driver data can be minimized independently from office data.
- Offline/cache behavior remains isolated to the field application.
- Shared packages must not erase distinct security and UX boundaries.

## Rejected alternatives

- One role-switched frontend: increases accidental data exposure and couples unrelated release concerns.
- Native mobile applications initially: deferred unless background tracking requires a focused companion.

