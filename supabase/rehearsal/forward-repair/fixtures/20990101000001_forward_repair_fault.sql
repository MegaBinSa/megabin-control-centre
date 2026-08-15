create schema if not exists assurance_forward_repair;
revoke all on schema assurance_forward_repair from public, anon, authenticated;

create table assurance_forward_repair.semantic_invariant (
  scenario_id text primary key,
  semantic_state text not null,
  fault_migration_version text not null,
  repair_migration_version text,
  created_at timestamptz not null default now(),
  repaired_at timestamptz
);

revoke all on table assurance_forward_repair.semantic_invariant from public, anon, authenticated;

insert into assurance_forward_repair.semantic_invariant (
  scenario_id,
  semantic_state,
  fault_migration_version
) values (
  'FR-SEMANTIC-INVARIANT-001',
  'invalid_pending_forward_repair',
  '20990101000001'
);
