# Event Catalogue

**Status:** Phase 0B-4 contract foundation

## Event envelope

Every durable domain event contains:

| Field | Rule |
|---|---|
| Event ID | Immutable UUID; identifies one event across retries |
| Name | Version-independent PascalCase segments, for example `Routes.RoutePublished` |
| Version | Positive integer carried separately from the name |
| Producer | Canonical owning-module key |
| Aggregate | Stable aggregate type and immutable UUID |
| Occurred at | UTC time of the domain fact |
| Correlation ID | Connects one business or technical flow |
| Causation ID | Optional preceding command or event ID |
| Actor | Optional user, system, or integration reference |
| Payload | JSON object containing the versioned event data |

Events describe completed facts and use past-tense names. Consumers must ignore additive fields they do not need. A semantic breaking payload change increments the version; existing versions remain interpretable for their retention period.

## Outbox lifecycle

`pending -> processing -> published`

A dispatcher may retry by returning an event to `pending` with a later availability time. Exhausted or non-retriable delivery moves to `dead_letter` with a safe error summary. Claiming, retry thresholds, replay authorization, and retention will be implemented with the dispatcher rather than guessed in this phase.

The outbox is delivery infrastructure, not event sourcing. Authoritative module tables remain the current operational truth.

## Catalogue status

The blueprint's likely events remain candidates until their producing workflows are implemented. Each accepted event must later document producer, trigger, schema/version, consumers, sensitivity, retention, and replay behavior here. Phase 0B-4 adds only the envelope and lifecycle; it does not declare speculative production payloads.

## Phase 1A accepted events

| Event v1 | Producer | Trigger | Payload minimum |
|---|---|---|---|
| `Clients.ClientCreated` | Clients | Idempotent client creation commits | `clientId` |
| `Clients.ClientActivated` | Clients | Lifecycle enters Active | `clientId`, previous/new status |
| `Clients.ClientPlacedOnHold` | Clients | Lifecycle enters On Hold | `clientId`, previous/new status |
| `Clients.ClientCancelled` | Clients | Lifecycle enters Cancelled | `clientId`, previous/new status |
| `ServiceAddresses.ServiceAddressCreated` | Service Addresses | Address creation commits | `serviceAddressId` |
| `ServiceAddresses.ServiceAddressChanged` | Service Addresses | Address attributes change | `serviceAddressId` |
| `ServiceConfiguration.ServiceConfigured` | Service Configuration | First/current permanent configuration commits | `clientServiceId`, configured drum count |
| `ServiceConfiguration.DrumCountChanged` | Service Configuration | Effective-dated permanent drum count changes | `clientServiceId`, previous/new count |
| `Vehicles.VehicleAvailabilityChanged` | Vehicles | Availability changes | `vehicleId`, previous/new availability |

Events contain IDs and operational state only; sensitive client identity/contact values are excluded.

Phase 1B exposes these workflows through the authenticated API without changing event payload versions. Reads and contact-only edits do not emit domain events. Client creation, service-address creation/change, effective-dated service configuration, drum-count change, and vehicle availability changes continue to use the accepted events above in the same transaction as their authoritative write and audit fact.
