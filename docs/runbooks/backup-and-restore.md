# Backup and Restore Runbook

Supabase paid plans provide daily backups with plan-dependent retention; PITR is a separately enabled paid capability and must not be claimed until the Staging project shows it enabled. Database backups contain Storage metadata, not deleted Storage objects. Restores cause project downtime and custom-role credentials may need recovery.

Record project plan, backup type, earliest/latest restore point, Storage backup posture and responsible operator. Proposed RPO/RTO remain business decisions: record maximum tolerable data loss and outage separately for staging, pilot and production.

Rehearsal must use Supabase's isolated restore-to-new-project path (or another explicitly approved independent target), verify migration history, critical reference data, synthetic personas/access and integrity assertions, then run application health checks. Record source, target, backup/recovery point, operator/verifier, elapsed time, release/database identity and result. Never overwrite active Staging solely for a rehearsal.

Run `pnpm recovery:validate` before any operator action. The guard requires `MEGABIN_ENVIRONMENT=restore-rehearsal`, the exact approved Staging source and isolated recovery target, an explicit recovery point, source/target-bound confirmation, approved RPO/RTO and both authorities. The protected `Rehearse staging recovery` workflow performs a Free-plan logical dump/restore only after verifying the target is empty or carries the repository-owned disposable marker. It never uploads logical dumps. The current one-hour RPO remains unmet; a successful rehearsal may establish observed RTO only. Sidney must independently verify the evidence before acceptance.

The workflow is operator-triggered and may run only after its definition is merged to the default branch. Do not reproduce its destructive target preparation manually or point it at active Staging.
