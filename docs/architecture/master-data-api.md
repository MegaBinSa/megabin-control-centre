# Master Data API

**Status:** Phase 1A administration foundation

Office administration uses `/api/v1/master-data/{resource}` contracts for clients, service addresses, client services, regions, depots, territories, teams, staff, and vehicles. GET supports ID retrieval and filtered lists. POST creates, PATCH updates, and the archive action performs a soft lifecycle/deactivation transition.

Retryable writes require `Idempotency-Key` and `X-Correlation-Id`. Public models use camelCase and immutable UUIDs rather than database row shapes. The application layer authenticates, checks granular permission and region scope, validates, and executes an owning-module command. Authoritative state, audit, idempotency result, and applicable outbox events commit together.

The first SQL command functions prove client, address, service/configuration, and vehicle workflows. The shared `@megabin/master-data` application service defines the consistent create/update/archive/get/list boundary for remaining resources. Frontends have no direct write grants.
