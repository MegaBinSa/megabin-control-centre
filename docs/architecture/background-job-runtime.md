# Background-Job Runtime

**Status:** Phase 0B-6 executable proof

The bounded runner accepts job identity, type, idempotency key, concurrency key, correlation ID, attempt number, cancellation signal, and a small unit of work. Its state-store port owns durable idempotency, concurrency ownership, and failure records in a deployed implementation.

The synthetic in-memory store exists only for deterministic contract tests. It is not an approved production adapter. Production scheduled work must use PostgreSQL-backed reservations and `background_job_failures` before a real job is enabled.

Cancellation is checked before and around work. Failures are classified and recorded safely. Duplicate completed work returns the prior result. No operational schedule exists.
