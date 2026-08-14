do $$
declare
  office_id uuid;
  driver_id uuid;
  synthetic_region uuid := '10000000-0000-0000-0000-000000000001';
  migration_count integer;
begin
  select count(*) into migration_count from supabase_migrations.schema_migrations;
  if migration_count <> 23 then
    raise exception 'unexpected_migration_count:%', migration_count;
  end if;
  select id into strict office_id from auth.users where email = 'staging-office@megabin.local';
  select id into strict driver_id from auth.users where email = 'staging-driver@megabin.local';
  if not app_private.user_has_region_permission(office_id, 'master_data.read', synthetic_region) then
    raise exception 'recovered_office_region_permission_failed';
  end if;
  if app_private.user_has_global_permission(office_id, 'master_data.read') then
    raise exception 'recovered_office_unintended_global_scope';
  end if;
  if app_private.user_has_region_permission(driver_id, 'master_data.read', synthetic_region) then
    raise exception 'recovered_driver_office_permission_denial_failed';
  end if;
  if app_private.accounting_has_permission(driver_id, 'accounting.read') then
    raise exception 'recovered_driver_financial_denial_failed';
  end if;
  if not exists (
    select 1 from app_private.staff
    where staff_id = '55000000-0000-0000-0000-000000000001'
      and user_id = driver_id and is_active
  ) then raise exception 'recovered_driver_staff_link_failed'; end if;
  if not exists (
    select 1 from app_private.service_regions where service_region_id = synthetic_region
  ) then raise exception 'recovered_synthetic_region_missing'; end if;
end
$$;

insert into recovery_control.target_state (
  singleton, target_project_ref, source_project_ref, disposable, last_rehearsal_at
) values (
  true, 'ivtaoqorcryzsempsogs', 'xniweqdmswzljcgkfglx', true, now()
)
on conflict (singleton) do update
set disposable = excluded.disposable,
    last_rehearsal_at = excluded.last_rehearsal_at;
