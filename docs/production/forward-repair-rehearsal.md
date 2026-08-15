# Isolated Database Forward-Repair Rehearsal

**Status:** Protected mechanism implemented; remote execution Not Run

`Rehearse staging database forward repair` is a manual-only workflow for `FR-SEMANTIC-INVARIANT-001`. It treats shared Staging `xniweqdmswzljcgkfglx` as read-only and applies two repository-controlled synthetic migrations only to isolated recovery project `ivtaoqorcryzsempsogs`. The fixtures live outside `supabase/migrations` and are copied into a runner-local migration tree only after every protected precondition passes.

The fault migration commits a private `assurance_forward_repair.semantic_invariant` row in `invalid_pending_forward_repair`. Post-migration verification must fail once with `MBA-FR-EXPECTED-001`. The separate immutable repair migration changes the row to `repaired`, records both migration versions, adds the missing check constraint as `NOT VALID`, then validates it. The workflow uses `supabase db push --db-url` for both target migrations. It never down-migrates, deletes migration history, resets shared Staging, or cleans the isolated target.

Execution is blocked until the `staging-recovery` GitHub Environment is main-only, prevents self-review, disables administrator bypass where supported, and requires Sidney's GitHub account as independent reviewer. `RECOVERY_AUTHORITY_GITHUB_LOGIN` and `RECOVERY_VERIFIER_GITHUB_LOGIN` must be supplied after the actual usernames are approved; the workflow requires the dispatching actor to match the authority login and requires the verifier login in Environment protection metadata. Shaun is recovery authority/operator and Sidney is independent verifier/reviewer.

Inputs are limited to `source_sha`, `baseline_recovery_run_id`, the single scenario choice, and source/target/SHA-bound confirmation. Arbitrary SQL, project references, migration paths/versions, destructive overrides and cleanup switches are not accepted. The workflow also requires current-main identity, green quality/database checks, successful recovery-run provenance, no conflicting Staging deployment or recovery-target run, exact fixture inventory/hashes, a disposable verified target, and a target migration baseline matching shared Staging.

On unexpected failure, later migration steps stop. No rollback or automatic recycle runs. The isolated target is retained for inspection and may be recycled only through the separately authorized recovery workflow. Sanitized evidence records identities, hashes, timestamps, exact expected failure, repair result and security/integrity assertions. It excludes credentials, URLs, SQL dumps, Auth/client data and sensitive payloads. Artifact retention remains 90 days, so the approved 12-month target is unresolved. The one-hour RPO is also unresolved.

The workflow existing does not make this capability Passed. A successful protected run plus Sidney's independent evidence confirmation is required.
