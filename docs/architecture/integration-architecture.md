# Integration Architecture

**Status:** Approved initial integration boundary

## Principles

- Every external provider is accessed through a provider-neutral adapter owned by the Integrations module or the relevant domain boundary.
- Core business logic depends on capabilities/interfaces, not provider SDKs or payloads.
- External systems never access the operational database directly.
- Each integration declares purpose, authority, allowed inbound/outbound data, authentication, idempotency, retry, health, failure, conflict, retention, and decommission behavior.
- Provider payloads are validated and translated at the boundary before reaching domain services.
- Integration credentials are environment-specific secrets.

## Reliability pattern

```text
Inbound provider/webhook
  -> authenticate and validate
  -> deduplicate/idempotency check
  -> translate to application command
  -> owning module transaction
  -> durable outbox event

Domain event/outbox
  -> adapter dispatch
  -> retry with bounded backoff
  -> provider result metadata
  -> dead-letter/Needs Attention when exhausted
```

The PostgreSQL outbox is the initial durable event mechanism. No message broker is introduced in Phase 0. Consumers must be idempotent and event contracts versioned.

## Initial adapters

| Adapter | Direction and boundary |
|---|---|
| Website intake | Receives reliably forwarded, local-save-first signup submissions; creates/updates pending intake idempotently |
| Spreadsheet transition | Imports only approved temporary fields, creates batch provenance and conflicts, and never silently overwrites owned data |
| Accounting | Imports financial facts; Control Centre derives operational state without claiming financial authority |
| Mapping | Supplies geocoding/distance calculations; owns no MegaBin business entity |
| Routing | Supplies travel matrices, ordered road routes, static-road estimates, and internalized geometry through a Routes-owned contract |
| Optimization | Supplies candidate assignments and ordering through a separate Routes-owned contract; it is not assumed to share the routing vendor |
| GPS/tracking | Ingests scoped telemetry and device metadata; Tracking module derives current vehicle state |
| Communications | Sends message intents and consumes provider delivery events without placing provider logic in domain workflows |

## Failure and replacement

Core transactions must define behavior when a provider is unavailable. External dispatch normally occurs after the authoritative transaction through the outbox. Provider identifiers and payload metadata remain scoped to adapters so a provider can be replaced without changing master entity identities or business rules.

The standard install-to-decommission process, environment modes, and health states are defined in the [integration lifecycle](integration-lifecycle.md). Phase 2B selects deterministic fake routing and optimization adapters by safe environment configuration. A production adapter requires credentials in the runtime secret store and a provider-selection ADR; provider keys, SDK types, raw payloads, and credentials do not enter route-domain records.

## Website onboarding boundary

The website remains local-save-first and submits immutable signup intake asynchronously. It is authoritative only for the original submission until activation. The Control Centre never depends on WordPress tables or writes them, and the website never writes master-data tables. See [Website Intake](website-intake.md) and the [website integration contract](website-integration-contract.md).

## Accounting boundary

Phase 4C adds provider-neutral Accounting adapters. Zoho Books translation remains inside its adapter; immutable normalized facts and explicit Client mappings feed only the controlled snapshot and advisory eligibility contract. Routes and Client Services never query Zoho or provider facts directly. Local and CI use the deterministic fake adapter; live activation requires environment secrets and a production provider decision.
