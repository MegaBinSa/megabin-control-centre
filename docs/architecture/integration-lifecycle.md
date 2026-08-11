# Integration Lifecycle

**Status:** Phase 0B-5 foundation

## Standard lifecycle

```text
install -> configure -> test -> enable -> monitor -> disable -> decommission
```

- **Install:** create an environment-specific registration with provider and capability identity.
- **Configure:** declare allowed inbound fields, allowed outbound events, mode, and a reference to separately stored authentication material.
- **Test:** validate authentication, connectivity, translation, idempotency, and safe failure behavior without business-side effects.
- **Enable:** permit the owning application workflow to use the adapter.
- **Monitor:** record health, last success, last failure, correlation IDs, and redacted activity metadata.
- **Disable:** stop new activity temporarily or indefinitely without deleting history or credentials prematurely.
- **Decommission:** prove no active dependency remains, disable webhook/schedule entry points, preserve required records, revoke credentials, then mark the registration terminal.

## Modes and isolation

`capture` records safe intended interactions without dispatch. `test` uses a fake or provider sandbox. `live` is permitted only in production and still requires an enabled lifecycle state. Local and staging registrations, credentials, endpoints, and provider accounts are isolated from production.

The Phase 0B-5 fake adapter supports capture and test modes only. Its replaceability test proves application-facing code depends on the adapter interface rather than provider details.

## Health and failure

Health is `healthy`, `degraded`, `unhealthy`, `disabled`, or `unknown`. Failures are classified as retryable, rate limited, authentication, invalid request, or permanent. Health summaries and failure metadata must be safe to expose to technical operators and must not include provider credentials or unredacted payloads.
