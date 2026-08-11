# Technical Retention Rules

**Status:** Phase 0B-5 initial defaults

| Record | Default | Boundary |
|---|---:|---|
| Integration technical activity | 90 days | Safe metadata only; provider business facts remain with their owner |
| API and technical error diagnostics | 30 days | No stack traces, credentials, or unnecessary PII in persistent metadata |
| Background job failures | 30 days | Failure diagnostics, not job-produced business records |
| Outbox dead-letter state | Until resolved/replayed plus a future approved retention period | Existing outbox record is the source; no duplicate dead-letter table |
| Business audit | Long-lived; exact duration pending legal/operational decision | Separate Audit module and policy |

Expiry timestamps are recorded now. Automated deletion is deferred until retention jobs, legal holds, replay dependencies, and operational review are defined. Cleanup must be idempotent, bounded, observable, and disabled by default outside an explicitly configured environment.

Retention deletion never removes an authoritative business record merely because a related diagnostic expires.
