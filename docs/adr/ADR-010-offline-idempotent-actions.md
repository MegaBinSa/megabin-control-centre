# ADR-010: Offline and Idempotent Operational Actions

**Status:** Accepted

## Context

Field operations must tolerate intermittent connectivity, retries, duplicated submissions, and conflicts with office actions.

## Decision

Represent replayable operational actions with a unique event/action ID, device ID, local timestamp, ordering metadata, and idempotency key. The server records processed effects, preserves conflicts, and never silently overwrites newer authoritative state.

## Consequences

- APIs, webhooks, outbox consumers, and offline replay are designed idempotently.
- Conflict behavior is explicit and reviewable.
- The PWA caches only the minimum authorized route-day data and clears it under the retention policy.

## Rejected alternatives

- Last-write-wins synchronization.
- Assuming reliable continuous connectivity.
- Building a generic workflow engine for conflict handling.

