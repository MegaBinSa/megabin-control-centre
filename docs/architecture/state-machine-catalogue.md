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

## Route Optimization Attempt

`Pending -> Running -> Succeeded -> Accepted|Rejected` is the successful candidate path. `Pending|Running -> Failed|Cancelled|Superseded` are terminal non-application outcomes. A failed or rejected attempt leaves its source Route Version unchanged. Only a Succeeded attempt can be accepted, and acceptance creates a new Draft Route Version transactionally; it never publishes or mutates the source.

## Route Operation

Handoff creates the planned assignment and moves directly to `Available`. Driver actions enforce `Available -> Accepted -> In Progress`, `In Progress -> Suspended`, and `Suspended -> In Progress`. Those actions are offline-capable and idempotent; only suspend/resume is an explicit reversible pair. Office may reassign, cancel, or supersede only `Prepared`, `Assigned`, or `Available`, with a reason and the relevant concurrency/replacement checks. `Completed` and `Archived` exist as foundations but have no Phase 2C command. Backend RPCs are authoritative.
## Vehicle Tracking

- Tracking Device: `Registered -> Active <-> Suspended -> Revoked | Retired`. Revoked and Retired are terminal for ingestion.
- Tracking health is a derived read state: `Unknown | Healthy | Delayed | Stale | Offline | Suspended | Revoked`; it is not persisted as operational truth.

## Operational Intelligence and Needs Attention

- Derived Fact: `Open -> Acknowledged -> Resolved | Dismissed`; automatic recovery may move `Open|Acknowledged -> Resolved`. `Superseded` is reserved for rule/source-version replacement. Evidence remains immutable through human review.
- Needs Attention: `Open -> Acknowledged -> Resolved | Dismissed`. It follows the linked fact lifecycle and does not duplicate evidence or implement a generic workflow engine.

## Website Intake

`Received -> Processing -> Needs Review -> Approved -> Activating -> Activated`. Receipt validation may produce `Invalid`; Office may move `Needs Review -> Rejected`; technical processing or activation may produce `Failed`. Approval/rejection requires an authorised actor and optimistic version, with a reason for rejection or non-obvious override. `Activated` and `Rejected` are terminal in Phase 4A. Repeated activation returns the prior result.

## Client Migration Batch

`Created -> Uploaded -> Validating -> Needs Review -> Dry Run Complete -> Approved -> Activating -> Completed | Completed With Exceptions`. Approval freezes source identity, mapping/processing versions, counts, and reviewed plans. `Failed`, `Cancelled`, and `Archived` are reserved terminal/control states. Row outcomes are independently `Activated | Failed | Skipped | Conflict`; only technical `Failed` outcomes are retryable.

## Accounting

- Connection: `Configured -> Active <-> Degraded | Unhealthy | Authentication Required -> Disabled`. Health never changes Client or Service lifecycle.
- Sync Run: `Pending -> Running -> Succeeded | Partial | Failed | Cancelled`. Failed runs preserve the last valid snapshot.

## Financial Eligibility

Decisions are immutable versions: `Eligible | Warning | Hold Recommended | Held | Manual Review | Unknown`. Material change supersedes the current decision. Holds use `Proposed -> Active -> Released | Cancelled | Superseded`; released holds remain historical. Recommendation and explicit hold are distinct.

## Communications

- Intent: `Created -> Eligibility Pending -> Ready -> Sending -> Delivered | Partially Delivered | Failed | Suppressed`; unsent work may become `Cancelled`, and completed history may later be `Archived`.
- Attempt: `Pending -> Sending -> Accepted -> Sent -> Delivered`; technical failures are `Failed Temporary` or `Failed Permanent`, while provider/template rejection is `Rejected`. Delivery acknowledgement is monotonic.
- Template: `Draft -> Approved -> Active -> Retired`.
- Inbound: `New -> Recognized | Needs Review -> Processed | Ignored`. Command recognition is not operational execution.
# Client SKIP state machines

SKIP Request: `Received -> Matching -> Needs Review | Qualified -> Approved -> Applied -> Acknowledged`. `Rejected`, `Duplicate`, `Expired`, and `Failed` preserve history. Approval requires an optimistic review version and does not mutate recurring Service Configuration.

Collection Occurrence: `Expected -> Included | Excluded -> Completed | Not Serviced`, with `Cancelled` and `Superseded` reserved for explicit owning workflows. Driver completion remains authoritative where execution exists.
