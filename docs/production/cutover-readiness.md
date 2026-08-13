# Cutover Readiness

**Status:** Phase 5A prerequisite and runbook outline; cutover not authorized
**Last reviewed:** 2026-08-13

## Production cutover gates

Production cutover requires written evidence that:

- production Supabase, hosting, domains, TLS, secrets, Auth, deployment protections and smoke checks are isolated and validated;
- database migrations have passed staging replay, advisor review, backup and restore rehearsal, and migration recovery/rollback procedure;
- applicable routing, tracking, website, accounting and communications providers are contracted, configured, monitored and validated without production data leakage;
- client/service/address/region/team/vehicle data is migrated, reconciled and signed off with stable external references and coordinates of acceptable quality;
- production role bundles, users, MFA, devices, region scope, departures and emergency access are approved and tested;
- routes, Driver offline execution, tracking and operational exception paths have passed UAT and the controlled pilot;
- financial, communication, SKIP, privacy and retention policies are approved for enabled features;
- monitoring, alerts, incident contacts, support hours, training and operating procedures are active;
- RPO/RTO, backups, PITR where selected, restore, frontend/Function rollback and secret recovery are tested;
- a cutover window, accountable decision maker, go/no-go meeting, success measures and abort thresholds are recorded.

## Cutover sequence

1. Freeze scoped legacy master-data writes at the announced time and preserve immutable source exports/checksums.
2. Confirm provider, database, deployment, backup, monitoring and support readiness.
3. Run final migration in bounded batches; reconcile counts, mappings, rejected rows and region/team/day assignments.
4. Switch website forwarding to the production signed endpoint while preserving website local-save-first behavior and retry queue.
5. Provision/verify named users and managed devices; perform role and region smoke tests.
6. Generate, review, publish and hand off the first controlled operational day; do not auto-publish.
7. Verify intake, Driver sync, GPS, integration health, accounting/communications only where enabled, alerts and audit evidence.
8. Reconcile against legacy/source records and obtain business/operations/technical go-live acceptance.

## Rollback and recovery

Rollback must be defined per component rather than assumed to be one database reversal. Frontend and Edge Function releases use immutable previous artifacts. Database recovery normally prefers forward correction; destructive rollback is permitted only under a rehearsed migration-specific plan and verified backup. Provider endpoints can be disabled through kill switches while retaining inbound source records and retry evidence. Website intake must remain locally saved if the Control Centre is unavailable.

If operational cutover is aborted, stop new writes in the affected Control Centre scope, preserve audit/integration evidence, restore the declared legacy operating process, communicate through approved internal channels, and reconcile every write before another attempt. Never operate uncontrolled dual masters.

## Legacy coexistence and retirement

During pilot/cutover the legacy spreadsheet/process may remain available as a read-only reference and explicit fallback. Assign one authoritative writer per data category and time window. Any emergency legacy write must be logged and reconciled. Retire access only after the agreed parallel period, outcome reconciliation, backup/source preservation, user acceptance and business sign-off. Website signup remains website-authoritative until activation; after activation, Control Centre operational data is authoritative.

## Required operating material

- Office onboarding and user/role management
- roster, route planning, optimization, publication and handoff
- Driver PWA installation, offline recovery, logout/device loss and escalation
- vehicle tracking/privacy and live-intelligence review
- website intake and migration reconciliation
- accounting reconciliation and financial holds where enabled
- communications/template/test-recipient/live-mode operation where enabled
- SKIP queue, late request, replan and acknowledgement
- provider/platform incidents, compromised credentials and bad deployment
- backup/restore, migration recovery and cutover reconciliation

## Support ownership to assign

Record accountable business owner, operations owner, technical owner, security/privacy contact, finance owner, website owner, each provider support contact and any after-hours escalation. Phase 5A intentionally does not invent names.
