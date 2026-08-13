# Backup and Restore Runbook

Supabase paid plans provide daily backups with plan-dependent retention; PITR is a separately enabled paid capability and must not be claimed until the Staging project shows it enabled. Database backups contain Storage metadata, not deleted Storage objects. Restores cause project downtime and custom-role credentials may need recovery.

Record project plan, backup type, earliest/latest restore point, Storage backup posture and responsible operator. Proposed RPO/RTO remain business decisions: record maximum tolerable data loss and outage separately for staging, pilot and production.

Rehearsal must restore a known marker and schema into an isolated approved target or use Supabase's restore-to-new-project path, verify migration history and representative data, test application health, record elapsed times and destroy the isolated target only under approval. Never overwrite active Staging solely for a rehearsal. No rehearsal occurred in Phase 5B because no project/plan/access was available; `PRD-DR-001` remains Open.
