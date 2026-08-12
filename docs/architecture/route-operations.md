# Route Operations

**Status:** Phase 2C implemented foundation
**Last reviewed:** 2026-08-12

## Boundary and identity

Route Operations owns the immutable day-of-operation execution aggregate. Explicit handoff accepts only the Route Plan's current `Published` Route Version and creates exactly one operation per Planned Route. The operation keeps immutable references to Operational Day, Published Route Version, Planned Route, roster entry/version, region, and route date. A repeated handoff returns existing operations and creates no duplicate facts or events. Published Routes and roster/master defaults are never modified by execution changes.

## Assignment and manifest

Handoff snapshots the planned team, vehicle, roster staff, and operational stop manifest as assignment and manifest revision 1, then makes the route `Available`. Each revision is immutable history. An authorised Office user may reassign `Prepared`, `Assigned`, or `Available` operations with an expected revision and reason. Team and available vehicle must be in-region; staff must be active; an optional tracking device must be active for the vehicle. Reassignment revokes the prior assignment, increments assignment and manifest revisions, and does not edit permanent defaults or the Published Route. Normal post-start reassignment is deliberately not exposed pending an emergency policy.

The Driver manifest contains operation/date/source IDs, revisions, lifecycle, assigned team/vehicle/staff, optional device, start depot/location, planned timing/distance/duration, provider geometry when present, and immutable operation-stop rows. Stops preserve stable operation/source stop IDs, sequence, Service Address ID and snapshot, coordinates, territory, access/safety flags, drum units, and planned duration. Billing, finances, client identity, contacts, Office notes, and raw payloads are excluded. Previous manifest revisions remain stored; freshness reports stale/refresh-required and cancelled/superseded state.

## Driver authorization and offline actions

Driver access requires an active user/profile, `.driver.read` or `.driver.act`, an active staff record on the current non-revoked assignment, and matching global, service-region, or team scope. An assigned device must also match. APIs expose only current assignments, the narrow manifest, freshness, actions, and receipts. The future identity tuple is `user + current team assignment + authorised device (when assigned) + Route Operation`.

Implemented synthetic actions are `accept`, `start`, `suspend`, and `resume`. PostgreSQL durably records action/operation IDs, assignment revision, device when present, actor, client sequence/timestamp, idempotency/correlation IDs, action/payload versions, and a receipt in the same transaction as an accepted effect. Identical retries return `duplicate`; changed reuse returns `conflict`; stale revisions and invalid/superseded/cancelled states return `rejected`. Device sequence is diagnostic only.

## Supersession, security, and extension

Office may cancel a non-started operation with a reason. Explicit supersession requires an existing replacement operation from a different Published version for the same day/region. Accepted, In Progress, Suspended, or Completed operations cannot be silently cancelled or superseded.

All tables are in `app_private`, have RLS enabled, and deny browser roles. Bounded `api` RPCs re-authorize every actor. Audit/outbox data uses concise IDs/state and excludes manifests and offline payloads. `Planned Route Stop -> Route Operation Stop` supplies stable future execution identity; collection outcomes, GPS, live progress/re-optimisation, messaging, and full Driver PWA UX remain deferred.
