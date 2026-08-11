# API Conventions

**Status:** Phase 0B-4 foundation

## Boundary

Application interfaces begin at `/api/v1`. Office Web, Driver/Team PWA, and integrations use versioned interfaces rather than owning-module tables for important state changes. A major version changes only for an intentionally breaking contract; additive compatible changes remain within the current major version.

No HTTP server or public endpoint is introduced in Phase 0B-4. The shared package defines the contract vocabulary that later deployable API handlers must implement.

## Write rules

- State-changing operations enter the owning module's application layer.
- Cross-module writes call the owning application service or react to an approved domain event.
- A handler authenticates, authorizes, validates, and creates a command context before invoking domain logic.
- The authoritative write, idempotency result, audit fact where required, and outbox events share one PostgreSQL transaction.
- Frontend Data API access remains an explicitly reviewed exception protected completely by grants and RLS.

## Requests and responses

- JSON is the default representation and timestamps use UTC ISO 8601 strings.
- Immutable identifiers are UUIDs; display labels and mutable external identifiers never replace them.
- State-changing endpoints that may be retried require `Idempotency-Key` and `X-Correlation-Id` headers.
- Validation errors identify fields without exposing internal stack traces or confidential values.
- Errors use stable machine codes, a safe human message, and the correlation ID.

Initial error codes are `authentication_required`, `permission_denied`, `validation_failed`, `conflict`, `idempotency_key_reused`, `not_found`, `rate_limited`, and `internal_error`.

## Contract publication

OpenAPI must be generated from the implemented request/response contracts when API handlers are introduced. The specification is a build artifact, not a separately edited source of truth. Supabase's Data API schema endpoint is not the Control Centre's application API contract.
