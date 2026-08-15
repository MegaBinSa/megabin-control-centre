update assurance_forward_repair.semantic_invariant
set semantic_state = 'repaired',
    repair_migration_version = '20990101000002',
    repaired_at = now()
where scenario_id = 'FR-SEMANTIC-INVARIANT-001'
  and fault_migration_version = '20990101000001'
  and semantic_state = 'invalid_pending_forward_repair';

alter table assurance_forward_repair.semantic_invariant
  add constraint semantic_invariant_repaired_state
  check (
    semantic_state = 'repaired'
    and repair_migration_version = '20990101000002'
    and repaired_at is not null
  ) not valid;

alter table assurance_forward_repair.semantic_invariant
  validate constraint semantic_invariant_repaired_state;
