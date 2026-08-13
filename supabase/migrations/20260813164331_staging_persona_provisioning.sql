-- Phase 5C bounded bootstrap for the two synthetic shared-staging personas.
-- This is intentionally an administrator-only function in the unexposed schema.
create or replace function app_private.provision_synthetic_staging_personas(
  p_office_email text,
  p_driver_email text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  office_user_id uuid;
  driver_user_id uuid;
  office_role_id uuid;
  driver_role_id uuid;
  v_region_id constant uuid := '51000000-0000-0000-0000-000000000001'::uuid;
  v_team_id constant uuid := '54000000-0000-0000-0000-000000000001'::uuid;
  v_staff_id constant uuid := '55000000-0000-0000-0000-000000000001'::uuid;
  office_changed boolean := false;
  driver_changed boolean := false;
begin
  if lower(p_office_email) <> 'staging-office@megabin.local'
     or lower(p_driver_email) <> 'staging-driver@megabin.local'
     or p_office_email = p_driver_email then
    raise exception 'staging_persona_identity_not_allowed' using errcode = '22023';
  end if;

  select id into strict office_user_id
  from auth.users
  where lower(email) = lower(p_office_email) and email_confirmed_at is not null;
  select id into strict driver_user_id
  from auth.users
  where lower(email) = lower(p_driver_email) and email_confirmed_at is not null;
  select role_id into strict office_role_id from app_private.roles where role_key = 'office_admin';
  select role_id into strict driver_role_id from app_private.roles where role_key = 'driver_team';

  perform 1 from app_private.service_regions where service_region_id = v_region_id and is_active;
  if not found then raise exception 'synthetic_staging_region_missing'; end if;
  perform 1 from app_private.teams
  where app_private.teams.team_id = v_team_id
    and service_region_id = v_region_id and is_active;
  if not found then raise exception 'synthetic_staging_team_missing'; end if;
  perform 1 from app_private.staff
  where app_private.staff.staff_id = v_staff_id
    and default_team_id = v_team_id and operational_role = 'driver' and is_active
    and (user_id is null or user_id = driver_user_id);
  if not found then raise exception 'synthetic_staging_driver_prerequisite_invalid'; end if;

  office_changed := not exists (
    select 1 from public.user_profiles where user_id = office_user_id
      and display_name = 'Synthetic Staging Office' and is_active
  ) or not exists (
    select 1 from app_private.user_roles where user_id = office_user_id and role_id = office_role_id
  ) or not exists (
    select 1 from app_private.user_access_scopes
    where user_id = office_user_id and scope_kind = 'service_region' and scope_id = v_region_id
  );
  driver_changed := not exists (
    select 1 from public.user_profiles where user_id = driver_user_id
      and display_name = 'Synthetic Staging Driver' and is_active
  ) or not exists (
    select 1 from app_private.user_roles where user_id = driver_user_id and role_id = driver_role_id
  ) or not exists (
    select 1 from app_private.user_access_scopes
    where user_id = driver_user_id and scope_kind = 'team' and scope_id = v_team_id
  ) or not exists (
    select 1 from app_private.user_access_scopes
    where user_id = driver_user_id and scope_kind = 'service_region' and scope_id = v_region_id
  ) or not exists (
    select 1 from app_private.staff where app_private.staff.staff_id = v_staff_id and user_id = driver_user_id
  );

  insert into public.user_profiles(user_id, display_name, is_active)
  values
    (office_user_id, 'Synthetic Staging Office', true),
    (driver_user_id, 'Synthetic Staging Driver', true)
  on conflict(user_id) do update set
    display_name = excluded.display_name, is_active = true, updated_at = now()
  where public.user_profiles.display_name is distinct from excluded.display_name
     or not public.user_profiles.is_active;

  delete from app_private.user_roles
  where user_id = office_user_id and role_id <> office_role_id;
  delete from app_private.user_roles
  where user_id = driver_user_id and role_id <> driver_role_id;
  insert into app_private.user_roles(user_id, role_id)
  values (office_user_id, office_role_id), (driver_user_id, driver_role_id)
  on conflict do nothing;

  delete from app_private.user_access_scopes
  where user_id = office_user_id
    and not (scope_kind = 'service_region' and scope_id = v_region_id);
  delete from app_private.user_access_scopes
  where user_id = driver_user_id
    and not (
      (scope_kind = 'service_region' and scope_id = v_region_id)
      or (scope_kind = 'team' and scope_id = v_team_id)
    );
  insert into app_private.user_access_scopes(user_id, scope_kind, scope_id)
  values
    (office_user_id, 'service_region', v_region_id),
    (driver_user_id, 'service_region', v_region_id),
    (driver_user_id, 'team', v_team_id)
  on conflict do nothing;

  update app_private.staff set user_id = driver_user_id, updated_at = now()
  where app_private.staff.staff_id = v_staff_id and user_id is distinct from driver_user_id;

  if office_changed then
    insert into app_private.business_audit_facts(
      action_key, actor_id, module_key, target_type, target_id, correlation_id, after_state
    ) values (
      'identity.staging_persona_provisioned', office_user_id, 'identity-access',
      'user-profile', office_user_id, p_correlation_id,
      jsonb_build_object('persona','office','role','office_admin','scope','service_region')
    );
  end if;
  if driver_changed then
    insert into app_private.business_audit_facts(
      action_key, actor_id, module_key, target_type, target_id, correlation_id, after_state
    ) values (
      'identity.staging_persona_provisioned', driver_user_id, 'identity-access',
      'user-profile', driver_user_id, p_correlation_id,
      jsonb_build_object('persona','driver','role','driver_team','scope','team_and_region','staffId',v_staff_id)
    );
  end if;

  return jsonb_build_object(
    'officeUserId', office_user_id,
    'driverUserId', driver_user_id,
    'officeChanged', office_changed,
    'driverChanged', driver_changed,
    'regionId', v_region_id,
    'teamId', v_team_id,
    'staffId', v_staff_id
  );
exception
  when no_data_found then
    raise exception 'staging_persona_prerequisite_missing' using errcode = 'P0002';
  when too_many_rows then
    raise exception 'staging_persona_identity_ambiguous' using errcode = '21000';
end;
$$;

revoke all on function app_private.provision_synthetic_staging_personas(text,text,uuid)
  from public, anon, authenticated, service_role;
