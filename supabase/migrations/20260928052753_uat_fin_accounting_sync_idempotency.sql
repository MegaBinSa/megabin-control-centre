-- Phase 5E UAT-FIN-001 remediation: deterministic synchronization identities and a
-- bounded synthetic global accounting operator. No business or provider facts are
-- created by this migration.

alter table app_private.accounting_sync_runs
  add column idempotency_key text,
  add column request_payload jsonb not null default '{}'::jsonb;

create unique index accounting_sync_runs_idempotency_key_uidx
  on app_private.accounting_sync_runs(idempotency_key)
  where idempotency_key is not null;

create or replace function api.accounting_start_sync(
  p_actor uuid,
  p_body jsonb,
  p_correlation uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c app_private.accounting_connections%rowtype;
  r app_private.accounting_sync_runs%rowtype;
  v_idempotency_key text := coalesce(
    nullif(btrim(p_body ->> 'idempotencyKey'), ''),
    'correlation:' || p_correlation::text
  );
  v_request jsonb := jsonb_strip_nulls(jsonb_build_object(
    'provider', p_body ->> 'provider',
    'environment', p_body ->> 'environment',
    'organizationId', p_body ->> 'organizationId',
    'syncMode', p_body ->> 'syncMode',
    'cursor', p_body ->> 'cursor'
  ));
begin
  perform app_private.accounting_require(p_actor, 'accounting.sync');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_idempotency_key, 0));

  select * into r
  from app_private.accounting_sync_runs
  where idempotency_key = v_idempotency_key
  for update;

  if r.accounting_sync_run_id is not null then
    if r.request_payload is distinct from v_request then
      raise exception 'accounting_sync_idempotency_conflict' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'syncRunId', r.accounting_sync_run_id,
      'status', r.lifecycle_status,
      'duplicate', true
    );
  end if;

  select * into c
  from app_private.accounting_connections
  where provider = p_body ->> 'provider'
    and environment_name = p_body ->> 'environment';

  if c.accounting_connection_id is null then
    insert into app_private.accounting_connections(
      provider, environment_name, organization_reference, lifecycle_status,
      credential_reference
    ) values (
      p_body ->> 'provider', p_body ->> 'environment', p_body ->> 'organizationId',
      'configured', p_body ->> 'credentialReference'
    ) returning * into c;
  end if;

  if exists (
    select 1 from app_private.accounting_sync_runs
    where accounting_connection_id = c.accounting_connection_id
      and lifecycle_status in ('pending', 'running')
  ) then
    raise exception 'sync_running' using errcode = '55000';
  end if;

  insert into app_private.accounting_sync_runs(
    accounting_connection_id, provider, environment_name, sync_mode,
    lifecycle_status, cursor_before, initiated_by, initiation_kind,
    correlation_id, idempotency_key, request_payload
  ) values (
    c.accounting_connection_id, c.provider, c.environment_name,
    p_body ->> 'syncMode', 'pending', p_body ->> 'cursor', p_actor, 'user',
    p_correlation, v_idempotency_key, v_request
  ) returning * into r;

  update app_private.accounting_connections
  set last_attempt_at = now(), updated_at = now()
  where accounting_connection_id = c.accounting_connection_id;

  insert into app_private.business_audit_facts(
    action_key, actor_id, module_key, target_type, target_id,
    correlation_id, after_state
  ) values (
    'accounting.sync_started', p_actor, 'accounting', 'accounting-sync-run',
    r.accounting_sync_run_id, p_correlation,
    jsonb_build_object('provider', r.provider, 'mode', r.sync_mode)
  );

  return jsonb_build_object(
    'syncRunId', r.accounting_sync_run_id,
    'status', r.lifecycle_status,
    'duplicate', false
  );
end;
$$;

create or replace function app_private.provision_synthetic_staging_accounting_operator(
  p_email text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role_id uuid;
  v_changed boolean := false;
begin
  if lower(p_email) <> 'staging-accounting@megabin.local' then
    raise exception 'staging_accounting_identity_not_allowed' using errcode = '22023';
  end if;

  select id into strict v_user_id
  from auth.users
  where lower(email) = lower(p_email) and email_confirmed_at is not null;
  select role_id into strict v_role_id
  from app_private.roles
  where role_key = 'operations_manager';

  v_changed := not exists (
    select 1 from public.user_profiles
    where user_id = v_user_id
      and display_name = 'Synthetic Staging Accounting Operator'
      and is_active
  ) or not exists (
    select 1 from app_private.user_roles
    where user_id = v_user_id and role_id = v_role_id
  ) or not exists (
    select 1 from app_private.user_access_scopes
    where user_id = v_user_id and scope_kind = 'global'
  );

  insert into public.user_profiles(user_id, display_name, is_active)
  values (v_user_id, 'Synthetic Staging Accounting Operator', true)
  on conflict(user_id) do update set
    display_name = excluded.display_name,
    is_active = true,
    updated_at = now()
  where public.user_profiles.display_name is distinct from excluded.display_name
     or not public.user_profiles.is_active;

  delete from app_private.user_roles
  where user_id = v_user_id and role_id <> v_role_id;
  insert into app_private.user_roles(user_id, role_id)
  values (v_user_id, v_role_id)
  on conflict do nothing;

  delete from app_private.user_access_scopes
  where user_id = v_user_id and scope_kind <> 'global';
  insert into app_private.user_access_scopes(user_id, scope_kind, scope_id)
  values (v_user_id, 'global', null)
  on conflict do nothing;

  if v_changed then
    insert into app_private.business_audit_facts(
      action_key, actor_id, module_key, target_type, target_id,
      correlation_id, after_state
    ) values (
      'identity.staging_persona_provisioned', v_user_id, 'identity-access',
      'user-profile', v_user_id, p_correlation_id,
      jsonb_build_object(
        'persona', 'accounting-operator',
        'role', 'operations_manager',
        'scope', 'global'
      )
    );
  end if;

  return jsonb_build_object(
    'accountingOperatorUserId', v_user_id,
    'changed', v_changed,
    'role', 'operations_manager',
    'globalAccess', true
  );
exception
  when no_data_found then
    raise exception 'staging_accounting_persona_prerequisite_missing' using errcode = 'P0002';
  when too_many_rows then
    raise exception 'staging_accounting_persona_identity_ambiguous' using errcode = '21000';
end;
$$;

revoke all on function app_private.provision_synthetic_staging_accounting_operator(text, uuid)
  from public, anon, authenticated, service_role;