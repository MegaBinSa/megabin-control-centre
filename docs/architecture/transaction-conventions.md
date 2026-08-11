# Transaction Conventions

**Status:** Phase 0B-6 executable proof

The owning operation calls one PostgreSQL transaction function. It reserves the operation/idempotency pair, locks an existing reservation, validates the fingerprint, writes authoritative state, adds audit where required, appends outbox events, and records the completed response before commit.

If any step fails, PostgreSQL rolls the entire operation back. A failed transaction leaves no successful idempotency record. External adapters are never called inside the transaction.

Concurrent requests use the unique `(operation_key, idempotency_key)` constraint and row locking. An exact committed duplicate returns the stored response. A different fingerprint returns `idempotency_key_reused`. No process-local cache is authoritative.

The synthetic function rechecks the actor's active profile, permission, and global scope after the application authorization hook. This is defense in depth for the service-key call.
