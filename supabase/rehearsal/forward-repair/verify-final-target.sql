do $$
declare
  office_id uuid;
  driver_id uuid;
  synthetic_region constant uuid := '51000000-0000-0000-0000-000000000001';
  protected_table record;
begin
  if not exists (
    select 1
    from assurance_forward_repair.semantic_invariant
    where scenario_id = 'FR-SEMANTIC-INVARIANT-001'
      and semantic_state = 'repaired'
      and fault_migration_version = '20990101000001'
      and repair_migration_version = '20990101000002'
      and repaired_at is not null
  ) then
    raise exception 'forward_repair_semantic_invariant_failed';
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'semantic_invariant_repaired_state'
      and conrelid = 'assurance_forward_repair.semantic_invariant'::regclass
      and convalidated
  ) then
    raise exception 'forward_repair_constraint_not_validated';
  end if;

  select id into strict office_id from auth.users where email = 'staging-office@megabin.local';
  select id into strict driver_id from auth.users where email = 'staging-driver@megabin.local';
  if not app_private.user_has_region_permission(office_id, 'master_data.read', synthetic_region) then
    raise exception 'forward_repair_office_region_permission_failed';
  end if;
  if app_private.user_has_global_permission(office_id, 'master_data.read') then
    raise exception 'forward_repair_office_unintended_global_scope';
  end if;
  if app_private.user_has_region_permission(driver_id, 'master_data.read', synthetic_region) then
    raise exception 'forward_repair_driver_office_permission_denial_failed';
  end if;
  if app_private.accounting_has_permission(driver_id, 'accounting.read') then
    raise exception 'forward_repair_driver_financial_denial_failed';
  end if;
  if not exists (
    select 1 from app_private.staff
    where staff_id = '55000000-0000-0000-0000-000000000001'
      and user_id = driver_id
      and is_active
  ) then
    raise exception 'forward_repair_driver_staff_link_failed';
  end if;

  for protected_table in
    select expected.schema_name, expected.table_name
    from (values
      ('public', 'user_profiles'),
      ('app_private', 'user_roles'),
      ('app_private', 'user_access_scopes'),
      ('app_private', 'accounting_invoice_facts'),
      ('app_private', 'financial_eligibility_decisions')
    ) as expected(schema_name, table_name)
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = protected_table.schema_name
        and c.relname = protected_table.table_name
        and c.relrowsecurity
    ) then
      raise exception 'forward_repair_rls_not_enabled:%.%',
        protected_table.schema_name,
        protected_table.table_name;
    end if;
  end loop;
end
$$;
