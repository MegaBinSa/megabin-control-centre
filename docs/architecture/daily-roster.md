# Daily Roster architecture

## Authority and purpose

Permanent teams, staff defaults, vehicles, and depots remain master data. The Daily Roster owns the actual day-specific operating combination. An immutable Operational Day UUID identifies one service region/date; the date is never a primary key. Future Routes may read only a stable roster, but Phase 1D creates no route entities or reactions.

One current roster entry exists per Operational Day/team. It snapshots the normal vehicle/depot and records actual vehicle/depot plus staff assignments. Manual changes increment the entry version and append a compact assignment-history snapshot. This is ordinary state plus history, not event sourcing.

## Generation and availability

Draft generation is idempotent through unique region/date and day/team constraints. It adds missing active teams without replacing existing entries or manual overrides. Active staff with the team as `default_team_id` are expected members. Staff unavailability and vehicle maintenance/unavailability windows overlapping the region-local Operational Day exclude automatic assignment. Partial-day windows remain explicit UTC instants for future route working-window calculations; Phase 1D conservatively treats overlapping `unavailable` windows as blocking automatic assignment.

Workforce owns staff availability windows. Vehicles owns vehicle availability windows and base vehicle state. Daily Roster consumes both. These windows are operational scheduling only, not HR leave or maintenance work orders.

## Validation and substitutions

Backend commands reject inactive/unavailable resources, cross-region vehicles/depots, retired vehicles, and simultaneous duplicate vehicle/staff assignments. Readiness reports structured blocking issues for missing vehicles/drivers and inactive depots. A Draft cannot become Ready with blockers.

Daily vehicle, staff/team, and depot substitutions require a reason and never modify permanent defaults. Active-day emergency changes also require an explicit reason, preserve history, audit the change, and emit `DailyRoster.ActiveAssignmentChanged`; route reaction is deferred.

## Lifecycle and locking

`Draft -> Ready -> Locked -> Active -> Closed -> Archived`

Controlled corrections allow `Ready -> Draft`, `Locked -> Ready` with `roster.unlock` and a reason, and `Active -> Locked` for an explicit emergency freeze. Ready and Locked require successful readiness validation. Locked rejects ordinary assignment edits. Closed/Archived reject edits. Every transition uses optimistic concurrency on `updatedAt`.

## Security and API

Fixed `/api/v1/roster/*` and `/api/v1/availability/*` endpoints re-authorize granular permission plus service-region scope. Tables are private, RLS-enabled defense in depth, and inaccessible to browser roles. Retryable writes require idempotency and correlation headers. System Admin/Developer and Driver/Team receive no automatic operational authority.
