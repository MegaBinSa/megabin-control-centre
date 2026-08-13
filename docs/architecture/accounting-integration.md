# Accounting Integration

**Status:** Phase 4C implemented foundation

Accounting providers remain authoritative for customers, invoices, payments, credits, and balances. The Control Centre retains immutable normalized facts, explicit Client mappings, reconciliation decisions, and a derived operational account-status projection. Client, Client Service, configuration, roster, route, and Route Operations lifecycles are never written by Accounting.

The accepted domain model intentionally defers a billing `Account` entity. Provider customers map to Clients through `external_references`; an accounting-customer reconciliation record is the controlled projection until Account semantics are approved. Names alone never establish identity, ambiguous candidates require review, and Accounting cannot create Clients.

## Data flow

`provider adapter → sync run → immutable facts → reconciliation → Client snapshot → operational status/eligibility contract`

Facts use immutable internal UUIDs plus provider identity, version, modified time, receipt time, normalized data, and SHA-256 fingerprint. Repeat facts are idempotent. Provider archive/void state is normalized and history is retained rather than destructively replaced.

Snapshots contain outstanding and overdue minor-unit totals, currency, oldest overdue date, days overdue, invoice counts, latest payment date, aging bucket, sync time, stale threshold, and reconciliation state. Active credit adjustments reduce outstanding amounts. A failed sync changes provider health but does not corrupt the last valid snapshot.

## Status and freshness

Derived statuses are `Unknown`, `Current`, `Due Soon`, `Overdue`, `Seriously Overdue`, and `Manual Review`. Thresholds and freshness are typed environment configuration, not UI constants. Phase 4C derives current/overdue/serious-overdue and uses `Unknown` when a snapshot is stale. Due Soon is reserved by the contract for invoices approaching their due date as richer provider schedules become available.

A manual exception may temporarily report Current, Manual Review, or Unknown. It requires an actor, reason, and optional end time, is audited, and never alters provider facts. Removing it restores the derived result.

Facts and snapshot lineage are retained long enough to explain status changes. Automated purge is deferred until the financial retention/legal policy is approved. Generic logs contain counts, latency, failure class, health, correlation, and freshness only—never customer, invoice, payment, or balance payloads.

Future consumers use only the eligibility projection: account status, freshness, manual-exception presence, reconciliation state, and a non-binding recommendation. `financial_attention` and `review_required` are advisory foundations, not service holds or route decisions.
