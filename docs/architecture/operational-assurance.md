# Operational Assurance Architecture

**Status:** Phase 5D repository foundation

Operational assurance composes existing deployment and smoke contracts; it does not create a second application runtime. The scheduled `Monitor staging` workflow performs non-mutating availability, release, CORS, authentication, authorization and safe-provider checks. Each check maps to a stable alert ID and emits a private GitHub artifact containing release identity, observed status, severity, deduplication key, ownership, acknowledgement and resolution fields.

Shaun is the approved monitoring and escalation owner. GitHub Actions workflow notification email to `infomegabin@gmail.com` is the approved delivery route, with immediate email for SEV1/SEV2 and nonurgent email for SEV3. `MBA-STG-MON-TEST-001` creates a controlled workflow-only failure without an application outage. Run 31878853824 proved firing through GitHub state/artifact evidence, and Shaun separately human-confirmed mailbox receipt. Monitoring never uses client messaging.

Recovery is operator-triggered and separate from normal Staging. The repository guard binds active Staging `xniweqdmswzljcgkfglx` and recovery target `ivtaoqorcryzsempsogs`, rejects equal/arbitrary/Production targets, requires an explicit recovery point and source/target confirmation, and reads approved one-hour RPO, four-hour RTO and Shaun/Sidney authorities from version-controlled configuration. The protected workflow uses a Free-plan logical dump and may measure observed RTO. PITR is disabled and no retained hourly snapshots exist, so the target RPO remains unmet.

Frontend and Edge Function rollback select a prior immutable release. Database recovery remains an explicit reviewed forward repair: migrations are immutable and automatic down-migrations are prohibited. Every completed rehearsal must retain source/target or current/prior identities, operator, timestamps, verification results, migration identity and post-action smoke evidence.

Synthetic UAT is a bounded evidence process around MegaBin business journeys. Catalogue cases use stable IDs and require persona, preconditions, steps, expected and actual outcomes, evidence, result, timestamp, environment/release identity, tester and defect references. Synthetic UAT data uses the `megabin-uat` namespace and `uat:` source/idempotency prefix; shared personas are preserved and broad reset/truncate/delete operations are forbidden.
