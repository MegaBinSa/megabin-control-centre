# ADR-007: Durable PostgreSQL Outbox

**Status:** Accepted

## Context

Domain changes and external/event dispatch must not drift apart when providers or workers fail.

## Decision

Record versioned domain events in a PostgreSQL outbox in the same transaction as the authoritative change. Dispatch asynchronously with retry, dead-letter handling, replay controls, correlation/causation IDs, and idempotent consumers.

## Consequences

- The database initially provides event durability without another infrastructure product.
- Consumers and integration effects must tolerate repeat delivery.
- Retention and operational tooling will be defined incrementally.

## Rejected alternatives

- Fire-and-forget calls after commit.
- A message broker in the initial architecture.
- Event sourcing as the master persistence model.

