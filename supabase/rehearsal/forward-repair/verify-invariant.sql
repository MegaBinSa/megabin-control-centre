do $$
declare
  observed_state text;
begin
  select semantic_state
  into strict observed_state
  from assurance_forward_repair.semantic_invariant
  where scenario_id = 'FR-SEMANTIC-INVARIANT-001'
    and fault_migration_version = '20990101000001';

  if observed_state <> 'repaired' then
    raise exception 'MBA-FR-EXPECTED-001';
  end if;
end
$$;
