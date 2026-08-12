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

## Phase 1C accepted events

| Event v1 | Producer | Trigger | Payload minimum |
|---|---|---|---|
| `Geography.TerritoryCreated` | Geography | Valid territory and geometry commit | `territoryId` |
| `Geography.TerritoryGeometryChanged` | Geography | Authoritative geometry/rule change commits | `territoryId`, `territoryChangeId` |

Geometry and client/address details are excluded from events. Permanent override changes are audited by Service Configuration; a durable override event is deferred until a consumer exists.

## Phase 1D accepted events

| Event v1 | Producer | Trigger | Payload minimum |
|---|---|---|---|
| `DailyRoster.OperationalDayCreated` | Daily Roster | First idempotent generation creates the day | day, region, date IDs |
| `DailyRoster.AssignmentSubstituted` | Daily Roster | Draft/Ready assignment changes | day/entry IDs, version |
| `DailyRoster.RosterReady` | Daily Roster | Readiness gate succeeds | day ID, status |
| `DailyRoster.RosterLocked` | Daily Roster | Ready roster locks | day ID, status |
| `DailyRoster.RosterUnlocked` | Daily Roster | Authorised reasoned unlock | day ID, status |
| `DailyRoster.ActiveAssignmentChanged` | Daily Roster | Emergency post-start assignment changes | day/entry IDs, version |
| `Routes.RouteGenerated` | Routes | A deterministic version is generated from a locked roster | plan/version/day IDs, version number |
| `Routes.RouteReady` | Routes | A version passes its readiness gate | plan/version IDs, version number |
| `Routes.RoutePublished` | Routes | A version becomes the operationally published plan | plan/version IDs, version number |
| `Routes.RouteReplanned` | Routes | A new version is created from changed planning inputs | plan/version/day IDs, version number |
| `Routes.RouteAssignmentChanged` | Routes | An authorized Draft stop move changes assignment/sequence | plan/version/stop IDs |
| `Routes.RouteOptimizationRequested` | Routes | Authorized refinement is queued | plan/attempt/source-version IDs |
| `Routes.OptimizedRouteVersionCreated` | Routes | A validated candidate is accepted as a new Draft | plan/attempt/source/candidate version IDs |
| `Workforce.StaffAvailabilityChanged` | Workforce | Operational availability window saved | window/region IDs |
| `Vehicles.VehicleAvailabilityWindowChanged` | Vehicles | Operational vehicle window saved | window/region IDs |

Events intentionally exclude assignment snapshots and notes. Future Routes may consume locked/active roster events, but no route reaction exists in Phase 1D.

## Phase 2C accepted Route Operations events

| Event v1 | Trigger | Concise payload |
|---|---|---|
| `RouteOperations.RouteOperationCreated` | Handoff creates an operation | operation, Published Version, Planned Route, revisions |
| `RouteOperations.RouteAssigned` | Initial assignment commits | operation, team, vehicle, revision |
| `RouteOperations.RouteReassigned` | Reasoned pre-start reassignment | operation, team, vehicle, revision, reason |
| `RouteOperations.AssignmentAccepted` | Assigned Driver accepts | operation, revision, action ID |
| `RouteOperations.RouteStarted` | Accepted operation starts | operation, revision, action ID |
| `RouteOperations.RouteSuspended` | In-progress operation suspends | operation, revision, action ID |
| `RouteOperations.RouteResumed` | Suspended operation resumes | operation, revision, action ID |
| `RouteOperations.RouteSuperseded` | Explicit pre-start replacement | operation, replacement, reason |
| `RouteOperations.ManifestRevisionChanged` | Reassignment creates a manifest | operation, manifest revision |

Cancellation is audited but has no event until a consumer is approved. Payloads exclude manifests, staff snapshots, addresses, and raw offline actions.
