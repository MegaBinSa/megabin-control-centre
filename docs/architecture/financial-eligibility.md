# Financial Eligibility

**Status:** Phase 4D accepted implementation

Accounting owns facts and account status. Financial Eligibility owns immutable service decisions, overrides and holds. Route Planning consumes only eligibility, status, reason code, freshness, effective time and decision version; it never reads provider or accounting fact tables.

## Policy and precedence

Policy `2026-08-v1` records hold statuses, overdue age/amount, freshness tolerance, and automatic hold/release switches. Both automatic switches default to `false`.

Precedence is: active Financial Eligibility override; approved Accounting exception as an input; fresh reconciled account status; then the missing/stale/unreconciled fail-safe. Evidence is preserved rather than resolved by last-write-wins.

## Decisions, holds and stale data

Decisions are `Eligible`, `Warning`, `Hold Recommended`, `Held`, `Manual Review` or `Unknown`. Only explicit `Held` excludes collection. Holds use `Proposed`, `Active`, `Released`, `Cancelled` and `Superseded`. Material changes create new history.

Missing, stale or unreconciled evidence becomes `Manual Review` or `Unknown`; it does not automatically hold a service.

## Route impact

- New route generation represents Held work as unassigned with `financial_hold`.
- Decision changes mark affected Draft/Ready versions stale without rewriting stops.
- Published versions and existing Route Operations remain intact.
- Relevant post-publication/handoff conflicts create deduplicated Needs Attention items.
- Driver contracts contain no financial details.

Single-service reevaluation is idempotent. Client, region and stale/review scopes use durable jobs bounded to 500 services. Decision/override/hold history is retained with service history; an exact legal retention period remains to be approved.
