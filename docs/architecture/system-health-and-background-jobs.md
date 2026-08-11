# System Health and Background Jobs

**Status:** Phase 0B-5 foundation

## Health contracts

Health checks return `healthy`, `degraded`, `unhealthy`, `disabled`, or `unknown`, plus check time, safe summary, and optional redacted details. Readiness answers whether the component can safely serve work; liveness answers whether its process is responsive. Provider health does not become domain truth.

System Health correlates API errors, job failures, outbox dead letters, integration degradation, and tracking health when those capabilities exist. It owns technical health projections, not the underlying business entity.

## Background-job envelope

Every invocation has an immutable job ID, job type, idempotency key, concurrency key, correlation ID, positive attempt number, request time, and versioned payload. The concurrency key defines the smallest resource that must not run simultaneously.

Jobs must:

- reserve idempotency durably rather than use process memory;
- acquire bounded concurrency protection and release it safely;
- classify failures before applying bounded backoff;
- propagate correlation IDs into outbox and adapter work;
- check cancellation between safe units of work;
- never treat cancellation as successful completion;
- report terminal failures without logging secrets or payload PII.

Supabase Cron/`pg_cron` may later trigger appropriate jobs, but schedules are migration-controlled and environment-specific. Phase 0B-5 creates no schedules, workers, route generation, or notifications.
