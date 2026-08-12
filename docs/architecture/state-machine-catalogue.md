# State Machine Catalogue

**Status:** Phase 1A baseline

## Client and client service

Both aggregates use `Pending`, `Active`, `On Hold`, `Cancelled`, and `Archived`, but their states change independently. Archival is terminal for ordinary administration and preserves references. Re-activation and cancellation reversal require an explicitly approved future rule; they are not inferred here. Client state is not payment truth.

## Vehicle availability

Vehicles use `Available`, `In Service`, `Maintenance`, `Unavailable`, and `Retired`. Phase 1A records authorised transitions and publishes a change event but does not implement maintenance, roster, or route consequences. `Retired` also deactivates the vehicle master record.

## Address and territory state

Address validation (`Unvalidated`, `Valid`, `Invalid`, `Needs Review`) and geocoding (`Not Geocoded`, `Pending`, `Geocoded`, `Failed`) are separate. Territory service state is `Active`, `Inactive`, or `Limited`. Geometry changes do not transition assigned services automatically.

## Route Plan / Version

`Draft -> Ready -> Published -> Superseded -> Archived`. A Draft may return from Ready for correction; an abandoned Draft/Ready version may be Cancelled. Validation gates Ready and Published. Published and Superseded versions are immutable. Replanning creates a new Draft version rather than changing published history.

## Operational Day / Daily Roster

`Draft -> Ready -> Locked -> Active -> Closed -> Archived`. Ready and Locked require no blocking roster issues. Ready may return to Draft for preparation. Locked may return to Ready only with `roster.unlock` and a reason. Active may return to Locked only as an explicit emergency freeze. Locked, Closed, and Archived reject normal assignment edits; Active changes require a reason and preserve history. Backend commands enforce transitions and optimistic concurrency.
