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

Phase 2B adds independent fake routing and optimization adapters. They are deterministic and remain the local, staging, and CI defaults. Their provider-neutral contracts, bounded retries, timeout classification, safe usage records, and health projection are described in [Route Optimization](route-optimization.md). Enabling a billable production provider is a later explicit lifecycle and ADR decision.

## Health and failure

Health is `healthy`, `degraded`, `unhealthy`, `disabled`, or `unknown`. Failures are classified as retryable, rate limited, authentication, invalid request, or permanent. Health summaries and failure metadata must be safe to expose to technical operators and must not include provider credentials or unredacted payloads.

Accounting extends health with `authentication_required`. Its sync runs are durable and asynchronous. The fake Zoho Books adapter is the local/CI default; live Zoho configuration and credentials remain disabled pending production approval.
