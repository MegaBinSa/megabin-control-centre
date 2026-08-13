# Incident Response Runbook

## Severity

- **SEV1:** safety/privacy/security event, widespread operational outage, unrecoverable data risk or unauthorized access.
- **SEV2:** material workflow/provider degradation with a controlled fallback.
- **SEV3:** limited defect or delayed non-critical job with no immediate operational harm.

Assign incident lead, operations lead and technical lead; record environment/build/correlation IDs, scope, start time and decisions; protect evidence; use the approved fallback; communicate status on the assigned internal channel; and complete reconciliation and review.

Initial scenarios: deployment failure, migration failure, Supabase/database outage, Office unavailable, Driver PWA unavailable, Auth failure, background-job backlog, route generation failure, GPS ingestion/staleness, website/accounting/communications/routing integration outage, compromised credential, lost device and bad release. Each uses component health, workflow logs and safe correlation metadata—never raw client/provider payloads. Missing named contacts and alert channel remain deployment blockers.
