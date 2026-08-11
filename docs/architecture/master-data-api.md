# Master Data API

**Status:** Phase 1B authenticated administration boundary

Office administration uses `/api/v1/master-data/{resource}` contracts for clients, service addresses, client services, regions, depots, territories, teams, staff, and vehicles. GET supports ID retrieval and filtered lists. POST creates, PATCH updates, and the archive action performs a soft lifecycle/deactivation transition.

Retryable writes require `Idempotency-Key` and `X-Correlation-Id`. Public models use camelCase and immutable UUIDs rather than database row shapes. The application layer authenticates, checks granular permission and region scope, validates, and executes an owning-module command. Authoritative state, audit, idempotency result, and applicable outbox events commit together.

The first SQL command functions prove client, address, service/configuration, and vehicle workflows. The shared `@megabin/master-data` application service defines the consistent create/update/archive/get/list boundary for remaining resources. Frontends have no direct write grants.

Phase 1B implements fixed resource-specific `/api/v1/master-data` routes for all eleven resources. Contracts validate UUIDs, dates, lifecycle enums, positive counts, coordinate pairs, email, and South African mobile numbers before database execution. Responses use camelCase application models and the generated contract is committed at [OpenAPI](../api/openapi.json); `pnpm openapi:check` fails on drift.

Lists accept `page`, `pageSize`, `search`, `status`, `serviceRegionId`, `sort`, and `direction`. Page size is capped at 100. Important edits and archives require `expectedUpdatedAt`; stale values return HTTP 409 with `conflict`. Writes require bearer authentication, `Idempotency-Key`, and `X-Correlation-Id`.
