-- Phase 0B-6 removable synthetic runtime proof.
-- The `api` schema exposes tightly granted application functions, never tables.

create schema if not exists api;
revoke all on schema api from public, anon, authenticated;
grant usage on schema api to service_role;

create table app_private.synthetic_platform_proofs (
  proof_id uuid primary key,
  command_id uuid not null unique,
  actor_id uuid not null references auth.users (id),
  proof_value text not null check (char_length(proof_value) between 1 and 100),
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);

comment on table app_private.synthetic_platform_proofs is
  'Removable non-business state used only to prove the modular-monolith runtime transaction.';

create table app_private.technical_audit_facts (
  technical_audit_id uuid primary key default gen_random_uuid(),
  action_key text not null check (action_key ~ '^[a-z][a-z0-9_.-]*$'),
  actor_id uuid references auth.users (id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  correlation_id uuid not null,
  safe_metadata jsonb not null default '{}' check (jsonb_typeof(safe_metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

comment on table app_private.technical_audit_facts is
  'Synthetic technical audit facts; not the future authoritative business Audit module.';

alter table app_private.outbox_events
  add column replay_count integer not null default 0 check (replay_count >= 0),
  add column last_replayed_at timestamptz,
  add column last_replayed_by uuid references auth.users (id) on delete set null;

insert into app_private.permissions (permission_key, description)
values
  ('platform_proof.execute', 'Execute the removable synthetic platform runtime proof'),
  ('platform_proof.replay', 'Replay dead-letter events from the removable synthetic runtime proof')
on conflict (permission_key) do nothing;

insert into app_private.configuration_definitions (
  configuration_key, description, value_type, is_required, default_value
)
values
  (
    'runtime.proof-enabled',
    'Enables the removable synthetic runtime proof endpoint.',
    'boolean', true, null
  ),
  (
    'runtime.dispatcher-batch-size',
    'Maximum events claimed by one bounded dispatcher run.',
    'number', true, '10'
  ),
  (
    'runtime.dispatcher-max-attempts',
    'Maximum synthetic dispatch attempts before dead-letter.',
    'number', true, '3'
  )
on conflict (configuration_key) do nothing;

insert into app_private.feature_flags (flag_key, description, default_enabled)
values (
  'runtime.platform-proof',
  'Controls the removable synthetic runtime proof independently of authorization.',
  false
)
on conflict (flag_key) do nothing;

alter table app_private.synthetic_platform_proofs enable row level security;
alter table app_private.technical_audit_facts enable row level security;

revoke all on table app_private.synthetic_platform_proofs from public, anon, authenticated, service_role;
revoke all on table app_private.technical_audit_facts from public, anon, authenticated, service_role;
grant select, insert on table app_private.synthetic_platform_proofs to service_role;
grant select, insert on table app_private.technical_audit_facts to service_role;

grant select on table public.user_profiles to service_role;
grant select on table app_private.user_roles to service_role;
grant select on table app_private.role_permissions to service_role;
grant select on table app_private.user_access_scopes to service_role;

create or replace function app_private.user_has_global_permission(
  requested_user_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles as profile
    join app_private.user_roles as user_role on user_role.user_id = profile.user_id
    join app_private.role_permissions as role_permission on role_permission.role_id = user_role.role_id
    join app_private.user_access_scopes as access_scope on access_scope.user_id = profile.user_id
    where profile.user_id = requested_user_id
      and profile.is_active
      and role_permission.permission_key = requested_permission
      and access_scope.scope_kind = 'global'
  );
$$;

revoke all on function app_private.user_has_global_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.user_has_global_permission(uuid, text) to service_role;

create or replace function api.is_platform_proof_authorized(p_actor_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select app_private.user_has_global_permission(p_actor_id, 'platform_proof.execute');
$$;

create or replace function api.execute_platform_proof(
  p_command_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_correlation_id uuid,
  p_value text,
  p_force_rollback boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  reserved boolean;
  existing_record app_private.idempotency_records%rowtype;
  created_event_id uuid := gen_random_uuid();
  result_body jsonb;
begin
  if not app_private.user_has_global_permission(p_actor_id, 'platform_proof.execute') then
    raise exception 'platform_proof permission denied' using errcode = '42501';
  end if;
  if char_length(p_value) not between 1 and 100 then
    raise exception 'invalid proof value' using errcode = '22023';
  end if;

  insert into app_private.idempotency_records (
    operation_key, idempotency_key, request_fingerprint, expires_at
  ) values (
    'platform.proof.execute', p_idempotency_key, p_request_fingerprint,
    now() + interval '24 hours'
  )
  on conflict (operation_key, idempotency_key) do nothing
  returning true into reserved;

  select * into existing_record
  from app_private.idempotency_records
  where operation_key = 'platform.proof.execute'
    and idempotency_key = p_idempotency_key
  for update;

  if not coalesce(reserved, false) then
    if existing_record.request_fingerprint <> p_request_fingerprint then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    if existing_record.processing_status = 'completed' then
      return jsonb_set(existing_record.response_body, '{duplicate}', 'true'::jsonb);
    end if;
    raise exception 'idempotency_in_progress' using errcode = '55P03';
  end if;

  insert into app_private.synthetic_platform_proofs (
    proof_id, command_id, actor_id, proof_value, correlation_id
  ) values (
    p_command_id, p_command_id, p_actor_id, p_value, p_correlation_id
  );

  insert into app_private.technical_audit_facts (
    action_key, actor_id, target_type, target_id, correlation_id
  ) values (
    'platform_proof.executed', p_actor_id, 'synthetic_platform_proof',
    p_command_id, p_correlation_id
  );

  insert into app_private.outbox_events (
    event_id, producer_module, event_name, event_version, aggregate_type,
    aggregate_id, payload, correlation_id, causation_id, actor_kind,
    actor_id, occurred_at
  ) values (
    created_event_id, 'system-health', 'Platform.ProofRecorded', 1,
    'synthetic-platform-proof', p_command_id,
    jsonb_build_object('proofId', p_command_id, 'value', p_value),
    p_correlation_id, p_command_id, 'user', p_actor_id::text, now()
  );

  if p_force_rollback then
    raise exception 'synthetic_forced_rollback' using errcode = 'P0001';
  end if;

  result_body := jsonb_build_object(
    'proofId', p_command_id,
    'eventId', created_event_id,
    'value', p_value,
    'correlationId', p_correlation_id,
    'duplicate', false
  );

  update app_private.idempotency_records
  set processing_status = 'completed',
      response_status = 201,
      response_body = result_body,
      completed_at = now()
  where idempotency_record_id = existing_record.idempotency_record_id;

  return result_body;
end;
$$;

create or replace function api.claim_outbox_events(p_worker_id text, p_limit integer)
returns table (
  event_id uuid,
  event_name text,
  event_version integer,
  payload jsonb,
  correlation_id uuid,
  causation_id uuid,
  attempt_count integer
)
language plpgsql
set search_path = ''
as $$
begin
  if char_length(p_worker_id) not between 1 and 100 or p_limit not between 1 and 100 then
    raise exception 'invalid outbox claim arguments' using errcode = '22023';
  end if;
  return query
  with candidates as (
    select candidate.event_id
    from app_private.outbox_events as candidate
    where candidate.delivery_status = 'pending'
      and candidate.available_at <= now()
    order by candidate.available_at, candidate.created_at
    limit p_limit
    for update skip locked
  )
  update app_private.outbox_events as claimed
  set delivery_status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      attempt_count = claimed.attempt_count + 1,
      updated_at = now()
  from candidates
  where claimed.event_id = candidates.event_id
  returning claimed.event_id, claimed.event_name, claimed.event_version,
    claimed.payload, claimed.correlation_id, claimed.causation_id, claimed.attempt_count;
end;
$$;

create or replace function api.complete_outbox_event(p_event_id uuid, p_worker_id text)
returns boolean
language sql
set search_path = ''
as $$
  with completed as (
    update app_private.outbox_events
    set delivery_status = 'published', published_at = now(), locked_at = null,
        locked_by = null, last_error = null, updated_at = now()
    where event_id = p_event_id
      and delivery_status = 'processing'
      and locked_by = p_worker_id
    returning 1
  )
  select exists (select 1 from completed);
$$;

create or replace function api.fail_outbox_event(
  p_event_id uuid,
  p_worker_id text,
  p_safe_error text,
  p_max_attempts integer,
  p_base_delay_seconds integer,
  p_max_delay_seconds integer
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  current_attempt integer;
  retry_delay integer;
begin
  if p_max_attempts < 1 or p_base_delay_seconds < 1 or p_max_delay_seconds < p_base_delay_seconds then
    raise exception 'invalid retry settings' using errcode = '22023';
  end if;
  select event.attempt_count into current_attempt
  from app_private.outbox_events as event
  where event.event_id = p_event_id
    and event.delivery_status = 'processing'
    and event.locked_by = p_worker_id
  for update;
  if current_attempt is null then
    raise exception 'outbox claim not owned by worker' using errcode = '40001';
  end if;
  if current_attempt >= p_max_attempts then
    update app_private.outbox_events
    set delivery_status = 'dead_letter', locked_at = null, locked_by = null,
        last_error = left(p_safe_error, 1000), updated_at = now()
    where event_id = p_event_id;
    return 'dead_letter';
  end if;
  retry_delay := least(
    p_max_delay_seconds,
    (p_base_delay_seconds * power(2::numeric, greatest(current_attempt - 1, 0)))::integer
  );
  update app_private.outbox_events
  set delivery_status = 'pending', available_at = now() + make_interval(secs => retry_delay),
      locked_at = null, locked_by = null, last_error = left(p_safe_error, 1000), updated_at = now()
  where event_id = p_event_id;
  return 'retry_scheduled';
end;
$$;

create or replace function api.replay_dead_letter_event(p_event_id uuid, p_actor_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  replayed boolean;
begin
  if not app_private.user_has_global_permission(p_actor_id, 'platform_proof.replay') then
    raise exception 'platform_proof replay permission denied' using errcode = '42501';
  end if;
  update app_private.outbox_events
  set delivery_status = 'pending', available_at = now(), attempt_count = 0,
      locked_at = null, locked_by = null, last_error = null,
      replay_count = replay_count + 1, last_replayed_at = now(),
      last_replayed_by = p_actor_id, updated_at = now()
  where event_id = p_event_id and delivery_status = 'dead_letter'
  returning true into replayed;
  if coalesce(replayed, false) then
    insert into app_private.technical_audit_facts (
      action_key, actor_id, target_type, target_id, correlation_id
    )
    select 'platform_proof.dead_letter_replayed', p_actor_id, 'outbox_event',
      event.event_id, event.correlation_id
    from app_private.outbox_events as event where event.event_id = p_event_id;
  end if;
  return coalesce(replayed, false);
end;
$$;

create or replace function api.get_dead_letter_events()
returns table (
  event_id uuid, event_name text, event_version integer, payload jsonb,
  correlation_id uuid, causation_id uuid, attempt_count integer
)
language sql
stable
set search_path = ''
as $$
  select event.event_id, event.event_name, event.event_version, event.payload,
    event.correlation_id, event.causation_id, event.attempt_count
  from app_private.outbox_events as event
  where event.delivery_status = 'dead_letter'
  order by event.updated_at desc;
$$;

create or replace function api.get_runtime_configuration(p_environment_name text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      definition.configuration_key,
      coalesce(value.configuration_value, definition.default_value)
    ),
    '{}'::jsonb
  )
  from app_private.configuration_definitions as definition
  left join app_private.configuration_values as value
    on value.configuration_key = definition.configuration_key
    and value.environment_name = p_environment_name
  where definition.configuration_key like 'runtime.%';
$$;

create or replace function api.get_runtime_feature_flag(p_flag_key text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'key', flag.flag_key,
    'defaultEnabled', flag.default_enabled,
    'targets', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'environment', target.environment_name,
        'enabled', target.enabled,
        'roleId', target.role_id,
        'serviceRegionId', target.service_region_id,
        'teamId', target.team_id
      )))
      from app_private.feature_flag_targets as target
      where target.flag_key = flag.flag_key
    ), '[]'::jsonb)
  )
  from app_private.feature_flags as flag
  where flag.flag_key = p_flag_key;
$$;

create or replace function api.get_database_health()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'healthy', 'checkedAt', now(), 'summary', 'Database reachable.'
  );
$$;

create or replace function api.get_outbox_health()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'status', case when count(*) filter (where delivery_status = 'dead_letter') > 0
      then 'degraded' else 'healthy' end,
    'checkedAt', now(),
    'summary', case when count(*) filter (where delivery_status = 'dead_letter') > 0
      then 'Outbox has dead-letter events.' else 'Outbox ready.' end,
    'safeDetails', jsonb_build_object(
      'pending', count(*) filter (where delivery_status = 'pending'),
      'deadLetters', count(*) filter (where delivery_status = 'dead_letter')
    )
  )
  from app_private.outbox_events;
$$;

revoke all on all functions in schema api from public, anon, authenticated, service_role;
grant execute on all functions in schema api to service_role;
