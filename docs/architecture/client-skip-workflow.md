# Client SKIP workflow

**Status:** Phase 4F accepted implementation

## Boundary and lifecycle

Client SKIP consumes the provider-neutral `Communications.InboundCommandRecognized` fact and never reparses provider payloads. A matched command becomes a durable SKIP Request qualified against active Client Services and the nearest valid future Collection Occurrence. Multiple services, missing services, late timing, and other ambiguity remain visible for Office review; the system does not guess.

`Received -> Matching -> Needs Review | Qualified -> Approved -> Applied -> Acknowledged` is the normal path, with `Rejected`, `Duplicate`, `Expired`, and `Failed` review outcomes. Review commands use an expected review version. Approval freezes the target service, occurrence, service date, route-impact snapshot, actor, and time.

## Collection occurrence and exclusion

A Collection Occurrence is an immutable UUID-backed identity for one Client Service on one service date, optionally linked to its Operational Day. It snapshots the effective Service Configuration identity/version and expected ISO collection day. Address text and dates are not primary keys.

Approval creates one active `client_requested_skip` exclusion per occurrence. It does not alter Client Service lifecycle, recurring cadence, configured collection day, territory, default team, or future occurrences. Duplicate messages and retries preserve inbound history but cannot duplicate the active request, exclusion, or acknowledgement intent.

## Cutoff, route impact, and protection

The conservative default classifies timing as before, near, after, or unknown; publication is near-cutoff and accepted/in-progress execution is after-cutoff. Exact production clock thresholds remain typed configuration requiring approval. Automatic Draft replanning is disabled.

Route Planning consumes only the occurrence-exclusion contract. A skipped occurrence becomes explicit unassigned work with reason `client_requested_skip`. Approval marks affected Draft versions stale and returns Ready versions to Draft; it never deletes stops in place. Controlled replanning calls the existing generator to create a new Draft sourced from the prior version. Publication remains explicit.

Published Route Versions are immutable. Existing Route Operations and Driver manifests remain unchanged. An approved SKIP affecting accepted/in-progress execution creates a deduplicated Needs Attention signal. Only explicit pre-start supersession through Route Operations may replace a manifest, using existing revision/freshness rules.

## Acknowledgement, security, and deferrals

Approval or rejection creates one idempotent, client-safe Communication Intent; Client SKIP never calls a provider. Private tables have RLS enabled and no browser grants. Fixed APIs re-authorize `client_skip.read`, `.review`, `.approve`, `.reject`, and `.replan` against region scope. Driver/Team has no access. Audits and events omit raw message content and recipient details.

Production cutoff time, automatic Draft candidate generation, client withdrawal/UN-SKIP, and acknowledgement timing policy remain deferred. This phase never mutates active Driver execution, auto-publishes routes, or changes permanent service configuration.
