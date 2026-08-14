# Operational Assurance Architecture

**Status:** Phase 5D repository foundation

Operational assurance composes existing deployment and smoke contracts; it does not create a second application runtime. The scheduled `Monitor staging` workflow performs non-mutating availability, release, CORS, authentication, authorization and safe-provider checks. Each check maps to a stable alert ID and emits a private GitHub artifact containing release identity, observed status, severity, deduplication key, ownership, acknowledgement and resolution fields.

`UNASSIGNED` ownership and `UNCONFIGURED` delivery are deliberate fail-visible values. GitHub workflow state and artifacts provide technical evidence, but no operational alert delivery is claimed until MegaBin approves recipients, an owner, escalation ownership and a destination. Monitoring never uses client messaging.

Recovery is operator-triggered and separate from normal Staging. The repository guard requires a distinct source and restore-target project, rejects active Staging and Production as targets, binds confirmation to both project references, and requires approved RPO, RTO, recovery authority and recovery point. It produces an authorized plan only; it cannot invoke a restore. Supabase restore-to-new-project capability, plan eligibility and an isolated target remain external prerequisites.

Frontend and Edge Function rollback select a prior immutable release. Database recovery remains an explicit reviewed forward repair: migrations are immutable and automatic down-migrations are prohibited. Every completed rehearsal must retain source/target or current/prior identities, operator, timestamps, verification results, migration identity and post-action smoke evidence.

Synthetic UAT is a bounded evidence process around MegaBin business journeys. Catalogue cases use stable IDs and require persona, preconditions, steps, expected and actual outcomes, evidence, result, timestamp, environment/release identity, tester and defect references. Synthetic UAT data uses the `megabin-uat` namespace and `uat:` source/idempotency prefix; shared personas are preserved and broad reset/truncate/delete operations are forbidden.

