# Route Planning architecture

## Financial eligibility contract

Route Planning consumes only the Financial Eligibility service contract. A current `Held` decision produces explicit unassigned work with reason `financial_hold`. Draft/Ready versions become stale when the input changes. Published versions and active Route Operations are never silently mutated.

## Authority and aggregate

Routes owns Route Plan, immutable Route Version history, Planned Route, Planned Stop, assignment, sequence, planning metrics, unassigned-service decisions, readiness, and publication. One Route Plan is identified by an immutable UUID for an Operational Day; dates and address text are never identifiers. A plan points to its current working version and current published version. Published versions are immutable historical facts and later plans supersede rather than overwrite them.

Daily Roster owns the day-specific team, staff, vehicle, and depot input. Route generation requires a Locked roster and snapshots its signature, entry IDs, entry versions, assigned staff, vehicle, depot, and Operational Day update instant. Routes reads Clients, Service Configuration, Service Addresses, Geography, Workforce, and Vehicles; changes to those facts must use their owning modules.

## Eligibility and deterministic baseline

The eligibility query includes active clients/services whose effective configuration matches the service date, ISO collection day, and service region. It requires validated coordinates, a territory, an eligible locked-roster team, a vehicle/depot, and sufficient capacity/time. Weekly cadence is supported. Fortnightly, monthly, and custom cadence need an approved anchor/rule and remain explicitly unassigned until that contract exists.

Phase 2A uses a deterministic territory/geographic sweep with stable UUID tie-breaking. A drum is one capacity unit. Default estimates are 10 minutes service, 5 minutes fallback travel, and 30 minutes depot allowance; team maximum minutes and vehicle after-hours grace constrain the plan. These assumptions are version snapshots. Phase 2B can refine an eligible Draft/Ready version through the separate [provider-neutral route optimization boundary](route-optimization.md). The baseline remains available and is never relabelled as optimized after a provider failure.

Services that cannot be planned remain first-class `unassigned_route_services` records with a reason, constraint context, eligible alternatives, and remediation. The planner never silently omits an eligible service and never invents a collection result.

## Lifecycle and changes

`Draft -> Ready -> Published -> Superseded -> Archived`, with cancellation available for abandoned work. Only Draft is editable. Manual stop moves/reordering use fixed owning-module commands, require a reason, recheck target-team eligibility/capacity, resequence deterministically, and audit the change. Ready/Publish validate stale roster input plus hard capacity/window constraints. Unassigned work is a visible warning rather than hidden loss.

Replanning creates a new immutable version and records its source. Accepting an optimized candidate also creates a new Draft version, preserving provider road geometry separately from baseline schematic geometry and future actual GPS trails. Publishing supersedes an earlier published version atomically and emits `Routes.RoutePublished`. Retrieval/validation detects roster drift for Draft/Ready versions; published history is not retroactively marked stale. Route Operations, live traffic, dump insertion, GPS, driver execution, and automatic scheduling remain deferred.

## Security and API

Private tables have RLS enabled, no browser grants, and service-role-only database access. Fixed `/api/v1/route-plans/*` and `/api/v1/route-versions/*` application endpoints re-authorize granular permission and service-region scope. Retryable writes require idempotency and correlation headers. Direct frontend table writes and generic RPC dispatch are prohibited.
