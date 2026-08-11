-- Phase 0B-5 generic platform registries and technical diagnostics.
-- All objects remain private and contain no provider credentials or business data.

create table app_private.configuration_definitions (
  configuration_key text primary key check (
    configuration_key ~ '^[a-z][a-z0-9]*([.-][a-z0-9]+)*$'
    and configuration_key !~* '(^|[._-])(api[-_]?key|credential|password|secret|token)($|[._-])'
  ),
  description text not null check (char_length(description) between 1 and 500),
  value_type text not null check (value_type in ('boolean', 'number', 'string', 'json')),
  is_required boolean not null default false,
  default_value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint configuration_default_type check (
    default_value is null
    or (value_type = 'boolean' and jsonb_typeof(default_value) = 'boolean')
    or (value_type = 'number' and jsonb_typeof(default_value) = 'number')
    or (value_type = 'string' and jsonb_typeof(default_value) = 'string')
    or (value_type = 'json' and jsonb_typeof(default_value) = 'object')
  )
);

create table app_private.configuration_values (
  configuration_key text not null references app_private.configuration_definitions (configuration_key),
  environment_name text not null check (environment_name in ('local', 'staging', 'production')),
  configuration_value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (configuration_key, environment_name)
);

create table app_private.feature_flags (
  flag_key text primary key check (flag_key ~ '^[a-z][a-z0-9]*([.-][a-z0-9]+)*$'),
  description text not null check (char_length(description) between 1 and 500),
  default_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.feature_flag_targets (
  feature_flag_target_id uuid primary key default gen_random_uuid(),
  flag_key text not null references app_private.feature_flags (flag_key) on delete cascade,
  environment_name text not null check (environment_name in ('local', 'staging', 'production')),
  enabled boolean not null,
  role_id uuid references app_private.roles (role_id) on delete cascade,
  service_region_id uuid,
  team_id uuid,
  created_at timestamptz not null default now()
);

create index feature_flag_targets_match_idx
  on app_private.feature_flag_targets (
    flag_key, environment_name, role_id, service_region_id, team_id
  );

create table app_private.platform_setting_changes (
  setting_change_id uuid primary key default gen_random_uuid(),
  setting_kind text not null check (setting_kind in ('configuration', 'feature_flag')),
  setting_key text not null,
  environment_name text check (environment_name in ('local', 'staging', 'production')),
  previous_value jsonb,
  new_value jsonb,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index platform_setting_changes_lookup_idx
  on app_private.platform_setting_changes (setting_kind, setting_key, changed_at desc);

create or replace function app_private.validate_configuration_value()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_type text;
begin
  select definition.value_type
    into expected_type
    from app_private.configuration_definitions as definition
   where definition.configuration_key = new.configuration_key;

  if not (
    (expected_type = 'boolean' and jsonb_typeof(new.configuration_value) = 'boolean')
    or (expected_type = 'number' and jsonb_typeof(new.configuration_value) = 'number')
    or (expected_type = 'string' and jsonb_typeof(new.configuration_value) = 'string')
    or (expected_type = 'json' and jsonb_typeof(new.configuration_value) = 'object')
  ) then
    raise exception 'configuration value type does not match its definition'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger configuration_values_validate
before insert or update on app_private.configuration_values
for each row execute function app_private.validate_configuration_value();

create or replace function app_private.audit_platform_setting_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'configuration_values' then
    insert into app_private.platform_setting_changes (
      setting_kind, setting_key, environment_name, previous_value, new_value, changed_by
    ) values (
      'configuration', coalesce(new.configuration_key, old.configuration_key),
      coalesce(new.environment_name, old.environment_name),
      case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      case when tg_op = 'DELETE' then old.updated_by else new.updated_by end
    );
  elsif tg_table_name = 'feature_flags' then
    insert into app_private.platform_setting_changes (
      setting_kind, setting_key, previous_value, new_value
    ) values (
      'feature_flag', coalesce(new.flag_key, old.flag_key),
      case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      case when tg_op = 'DELETE' then null else to_jsonb(new) end
    );
  else
    insert into app_private.platform_setting_changes (
      setting_kind, setting_key, environment_name, previous_value, new_value
    ) values (
      'feature_flag', coalesce(new.flag_key, old.flag_key),
      coalesce(new.environment_name, old.environment_name),
      case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      case when tg_op = 'DELETE' then null else to_jsonb(new) end
    );
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger configuration_values_audit
after insert or update or delete on app_private.configuration_values
for each row execute function app_private.audit_platform_setting_change();

create trigger feature_flags_audit
after insert or update or delete on app_private.feature_flags
for each row execute function app_private.audit_platform_setting_change();

create trigger feature_flag_targets_audit
after insert or update or delete on app_private.feature_flag_targets
for each row execute function app_private.audit_platform_setting_change();

create table app_private.integration_registrations (
  integration_id uuid primary key default gen_random_uuid(),
  integration_key text not null unique check (integration_key ~ '^[a-z][a-z0-9_.-]*$'),
  provider_key text not null check (provider_key ~ '^[a-z][a-z0-9_.-]*$'),
  capability_key text not null check (capability_key ~ '^[a-z][a-z0-9_.-]*$'),
  environment_name text not null check (environment_name in ('local', 'staging', 'production')),
  lifecycle_status text not null default 'installed' check (
    lifecycle_status in ('installed', 'configured', 'tested', 'enabled', 'disabled', 'decommissioned')
  ),
  integration_mode text not null default 'capture' check (integration_mode in ('capture', 'test', 'live')),
  health_status text not null default 'unknown' check (
    health_status in ('healthy', 'degraded', 'unhealthy', 'disabled', 'unknown')
  ),
  permitted_inbound_fields text[] not null default '{}',
  permitted_outbound_events text[] not null default '{}',
  authentication_reference text check (authentication_reference ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_summary text check (failure_summary is null or char_length(failure_summary) <= 1000),
  disabled_until timestamptz,
  decommissioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_live_environment check (
    integration_mode <> 'live' or environment_name = 'production'
  ),
  constraint integration_decommission_shape check (
    (lifecycle_status = 'decommissioned' and decommissioned_at is not null)
    or (lifecycle_status <> 'decommissioned' and decommissioned_at is null)
  )
);

create table app_private.integration_activity_logs (
  integration_activity_id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references app_private.integration_registrations (integration_id),
  correlation_id uuid not null,
  interaction_id text,
  direction text not null check (direction in ('inbound', 'outbound', 'health_check')),
  outcome text not null check (outcome in ('succeeded', 'retryable_failure', 'permanent_failure', 'captured')),
  error_classification text check (
    error_classification in ('retryable', 'rate_limited', 'authentication', 'invalid_request', 'permanent')
  ),
  safe_metadata jsonb not null default '{}' check (jsonb_typeof(safe_metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  constraint integration_activity_expiry_order check (expires_at > occurred_at)
);

create index integration_activity_logs_lookup_idx
  on app_private.integration_activity_logs (integration_id, occurred_at desc);
create index integration_activity_logs_expiry_idx
  on app_private.integration_activity_logs (expires_at);
create index integration_activity_logs_correlation_idx
  on app_private.integration_activity_logs (correlation_id);

create table app_private.technical_error_logs (
  technical_error_id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  causation_id uuid,
  request_id text,
  job_id uuid,
  event_id uuid,
  error_category text not null check (
    error_category in (
      'validation', 'authentication', 'authorization', 'conflict',
      'dependency_transient', 'dependency_permanent', 'rate_limit', 'cancelled', 'unexpected'
    )
  ),
  safe_message text not null check (char_length(safe_message) between 1 and 1000),
  safe_metadata jsonb not null default '{}' check (jsonb_typeof(safe_metadata) = 'object'),
  environment_name text not null check (environment_name in ('local', 'staging', 'production')),
  build_id text not null,
  occurred_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint technical_error_expiry_order check (expires_at > occurred_at)
);

create index technical_error_logs_correlation_idx
  on app_private.technical_error_logs (correlation_id, occurred_at desc);
create index technical_error_logs_expiry_idx on app_private.technical_error_logs (expires_at);

create table app_private.background_job_failures (
  job_failure_id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  job_type text not null,
  idempotency_key text not null,
  concurrency_key text not null,
  correlation_id uuid not null,
  attempt integer not null check (attempt > 0),
  failure_category text not null check (
    failure_category in (
      'transient_dependency', 'permanent_dependency', 'validation',
      'concurrency', 'cancelled', 'unexpected'
    )
  ),
  safe_message text not null check (char_length(safe_message) between 1 and 1000),
  safe_metadata jsonb not null default '{}' check (jsonb_typeof(safe_metadata) = 'object'),
  failed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint background_job_failure_expiry_order check (expires_at > failed_at)
);

create index background_job_failures_job_idx
  on app_private.background_job_failures (job_id, attempt);
create index background_job_failures_expiry_idx
  on app_private.background_job_failures (expires_at);

alter table app_private.configuration_definitions enable row level security;
alter table app_private.configuration_values enable row level security;
alter table app_private.feature_flags enable row level security;
alter table app_private.feature_flag_targets enable row level security;
alter table app_private.platform_setting_changes enable row level security;
alter table app_private.integration_registrations enable row level security;
alter table app_private.integration_activity_logs enable row level security;
alter table app_private.technical_error_logs enable row level security;
alter table app_private.background_job_failures enable row level security;

revoke all on table app_private.configuration_definitions from public, anon, authenticated, service_role;
revoke all on table app_private.configuration_values from public, anon, authenticated, service_role;
revoke all on table app_private.feature_flags from public, anon, authenticated, service_role;
revoke all on table app_private.feature_flag_targets from public, anon, authenticated, service_role;
revoke all on table app_private.platform_setting_changes from public, anon, authenticated, service_role;
revoke all on table app_private.integration_registrations from public, anon, authenticated, service_role;
revoke all on table app_private.integration_activity_logs from public, anon, authenticated, service_role;
revoke all on table app_private.technical_error_logs from public, anon, authenticated, service_role;
revoke all on table app_private.background_job_failures from public, anon, authenticated, service_role;

revoke all on function app_private.validate_configuration_value() from public, anon, authenticated;
revoke all on function app_private.audit_platform_setting_change() from public, anon, authenticated;

grant select, insert, update, delete on table app_private.configuration_definitions to service_role;
grant select, insert, update, delete on table app_private.configuration_values to service_role;
grant select, insert, update, delete on table app_private.feature_flags to service_role;
grant select, insert, update, delete on table app_private.feature_flag_targets to service_role;
grant select, insert on table app_private.platform_setting_changes to service_role;
grant select, insert, update on table app_private.integration_registrations to service_role;
grant select, insert on table app_private.integration_activity_logs to service_role;
grant select, insert on table app_private.technical_error_logs to service_role;
grant select, insert on table app_private.background_job_failures to service_role;
