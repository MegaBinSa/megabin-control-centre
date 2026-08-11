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
