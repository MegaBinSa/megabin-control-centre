do $$
declare
  office_id uuid;
  driver_id uuid;
  synthetic_region constant uuid := '51000000-0000-0000-0000-000000000001';
  synthetic_team constant uuid := '54000000-0000-0000-0000-000000000001';
begin
  select id into strict office_id from auth.users where email = 'staging-office@megabin.local';
  select id into strict driver_id from auth.users where email = 'staging-driver@megabin.local';

  if not app_private.user_has_region_permission(office_id, 'master_data.read', synthetic_region) then
    raise exception 'office_positive_authorization_failed';
  end if;
  if not app_private.user_has_region_permission(office_id, 'clients.sensitive.read', synthetic_region) then
    raise exception 'office_sensitive_client_authorization_failed';
  end if;
  if app_private.user_has_global_permission(office_id, 'master_data.read') then
    raise exception 'office_scope_is_not_region_bounded';
  end if;
  if app_private.user_has_region_permission(driver_id, 'master_data.read', synthetic_region) then
    raise exception 'driver_office_permission_denial_failed';
  end if;
  if not exists (
    select 1 from app_private.staff s
    where s.staff_id = '55000000-0000-0000-0000-000000000001'
      and s.user_id = driver_id and s.default_team_id = synthetic_team
      and s.operational_role = 'driver' and s.is_active
  ) then raise exception 'driver_staff_link_failed'; end if;
  if not exists (
    select 1 from app_private.user_access_scopes
    where user_id = driver_id and scope_kind = 'team' and scope_id = synthetic_team
  ) then raise exception 'driver_team_scope_failed'; end if;
  if (select count(*) from app_private.user_roles where user_id = office_id) <> 1
     or (select count(*) from app_private.user_roles where user_id = driver_id) <> 1 then
    raise exception 'persona_role_cardinality_failed';
  end if;
end $$;

select jsonb_build_object(
  'status', 'verified',
  'officeRegionPermission', true,
  'officeSensitiveClientPermission', true,
  'officeGlobalScope', false,
  'driverOfficePermission', false,
  'driverStaffLinked', true
) as staging_persona_verification;
