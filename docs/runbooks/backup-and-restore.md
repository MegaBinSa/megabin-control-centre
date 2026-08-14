# Backup and Restore Runbook

Supabase paid plans provide daily backups with plan-dependent retention; PITR is a separately enabled paid capability and must not be claimed until the Staging project shows it enabled. Database backups contain Storage metadata, not deleted Storage objects. Restores cause project downtime and custom-role credentials may need recovery.

Record project plan, backup type, earliest/latest restore point, Storage backup posture and responsible operator. Proposed RPO/RTO remain business decisions: record maximum tolerable data loss and outage separately for staging, pilot and production.

Rehearsal must use Supabase's isolated restore-to-new-project path (or another explicitly approved independent target), verify migration history, critical reference data, synthetic personas/access and integrity assertions, then run application health checks. Record source, target, backup/recovery point, operator/verifier, elapsed time, release/database identity and result. Never overwrite active Staging solely for a rehearsal.

Run `pnpm recovery:validate` before any operator action. The guard requires `MEGABIN_ENVIRONMENT=restore-rehearsal`, distinct valid source/target refs, an explicit recovery point, source/target-bound confirmation and approved RPO/RTO/recovery authority. It rejects active Staging and Production as targets and produces a plan only. Actual plan capability and isolated target are unavailable, so no rehearsal occurred and `PRD-DR-001` remains Open.
