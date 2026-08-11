# Idempotency Conventions

**Status:** Phase 0B-4 foundation

## Contract

Every retryable state-changing operation has a stable operation key and caller-supplied idempotency key. The backend calculates a canonical SHA-256 request fingerprint and reserves the pair before applying effects.

- The first request records `in_progress` in the authoritative transaction.
- A completed request stores its HTTP-equivalent status and optional safe response object.
- A retry with the same operation, key, and fingerprint returns the recorded result without repeating effects.
- Reuse of the same operation/key with a different fingerprint returns `idempotency_key_reused` and changes nothing.
- Concurrent duplicates must resolve against the unique database constraint, not a process-local cache.
- Records expire only under a documented retention policy; cleanup is deferred until that policy exists.

The stored response must not contain secrets or unnecessary personal information.

## Offline and integration actions

Future Driver/Team actions also carry an immutable action ID, device ID, device-local timestamp, and ordering metadata. Those fields belong to the operational command contract and are deferred until the Driver/Team workflow exists.

Inbound webhooks use the provider's stable event identifier when trustworthy, otherwise an adapter-owned deterministic key. Outbox consumers record their own processed event IDs so repeat delivery is safe. Provider retries never bypass the owning application service.

## Scope

Phase 0B-4 creates the private persistence primitive and shared header names only. It does not implement middleware, offline synchronization, conflict resolution, webhook handlers, or consumer deduplication tables before those workflows exist.
