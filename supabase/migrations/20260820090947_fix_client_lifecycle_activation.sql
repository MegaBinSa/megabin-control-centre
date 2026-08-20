create or replace function api.master_data_update(
  p_actor_id uuid,
  p_resource text,
  p_entity_id uuid,
  p_body jsonb,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tbl text := app_private.master_data_table(p_resource);
  id_col text := app_private.master_data_id_column(p_resource);
  allowed text[] := app_private.master_data_columns(p_resource);
  assignments text;
  before_row jsonb;
  result jsonb;
  expected timestamptz := (p_body->>'expected_updated_at')::timestamptz;
  region_id uuid := (p_body->>'service_region_id')::uuid;
  previous_status text;
  next_status text;
  lifecycle_event text;
begin
  if tbl is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  if region_id is null then
    perform app_private.require_master_data_entity_access(
      p_actor_id,
      'master_data.write',
      p_resource,
      p_entity_id
    );
  else
    perform app_private.require_master_data_access(
      p_actor_id,
      'master_data.write',
      region_id
    );
  end if;

  result := app_private.begin_master_data_command(
    'master_data.' || replace(p_resource, '-', '_') || '.update.' || p_entity_id::text,
    p_idempotency_key,
    p_request_fingerprint
  );
  if result is not null then
    return result;
  end if;

  if p_resource = 'service-configurations' then
    raise exception 'effective_dated_configuration_requires_new_version' using errcode = 'P0001';
  end if;

  execute format(
    'select to_jsonb(t) from app_private.%I t where %I=$1 for update',
    tbl,
    id_col
  ) using p_entity_id into before_row;

  if before_row is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if expected is null or (before_row->>'updated_at')::timestamptz <> expected then
    raise exception 'stale_update' using errcode = '40001';
  end if;

  previous_status := before_row->>'lifecycle_status';
  next_status := coalesce(p_body->>'lifecycle_status', previous_status);

  select string_agg(
    format('%I=(jsonb_populate_record(null::app_private.%I,$1)).%I', key, tbl, key),
    ','
  )
  into assignments
  from jsonb_object_keys(p_body) as keys(key)
  where key = any(allowed);

  if assignments is null then
    return before_row;
  end if;

  if p_resource = 'clients' and p_body ? 'lifecycle_status' then
    assignments := assignments ||
      ',activated_at=case when $1->>''lifecycle_status''=''active'' then coalesce(activated_at,now()) else activated_at end' ||
      ',cancelled_at=case when $1->>''lifecycle_status''=''cancelled'' then coalesce(cancelled_at,now()) else cancelled_at end' ||
      ',archived_at=case when $1->>''lifecycle_status''=''archived'' then coalesce(archived_at,now()) else archived_at end';
  end if;

  execute format(
    'update app_private.%I set %s,updated_at=now() where %I=$2 returning to_jsonb(%I.*)',
    tbl,
    assignments,
    id_col,
    tbl
  ) using p_body, p_entity_id into result;

  insert into app_private.business_audit_facts(
    action_key,
    actor_id,
    module_key,
    target_type,
    target_id,
    correlation_id,
    before_state,
    after_state
  ) values (
    replace(p_resource, '-', '_') || '.updated',
    p_actor_id,
    case
      when p_resource = 'vehicles' then 'vehicles'
      when p_resource in ('clients', 'client-contacts', 'client-services') then 'clients'
      else 'geography'
    end,
    p_resource,
    p_entity_id,
    p_correlation_id,
    before_row,
    result
  );

  if p_resource = 'clients' and next_status is distinct from previous_status then
    lifecycle_event := case next_status
      when 'active' then 'Clients.ClientActivated'
      when 'on_hold' then 'Clients.ClientPlacedOnHold'
      when 'cancelled' then 'Clients.ClientCancelled'
      else null
    end;
    if lifecycle_event is not null then
      insert into app_private.outbox_events(
        producer_module,
        event_name,
        event_version,
        aggregate_type,
        aggregate_id,
        payload,
        correlation_id,
        actor_kind,
        actor_id,
        occurred_at
      ) values (
        'clients',
        lifecycle_event,
        1,
        'client',
        p_entity_id,
        jsonb_build_object(
          'clientId', p_entity_id,
          'previousStatus', previous_status,
          'status', next_status
        ),
        p_correlation_id,
        'user',
        p_actor_id::text,
        now()
      );
    end if;
  elsif p_resource = 'service-addresses'
    or (
      p_resource = 'vehicles'
      and before_row->>'operational_availability'
        is distinct from result->>'operational_availability'
    ) then
    insert into app_private.outbox_events(
      producer_module,
      event_name,
      event_version,
      aggregate_type,
      aggregate_id,
      payload,
      correlation_id,
      actor_kind,
      actor_id,
      occurred_at
    ) values (
      case when p_resource = 'vehicles' then 'vehicles' else 'service-addresses' end,
      case when p_resource = 'vehicles'
        then 'Vehicles.VehicleAvailabilityChanged'
        else 'ServiceAddresses.ServiceAddressChanged'
      end,
      1,
      case when p_resource = 'vehicles' then 'vehicle' else 'service-address' end,
      p_entity_id,
      case when p_resource = 'vehicles'
        then jsonb_build_object(
          'vehicleId', p_entity_id,
          'previousAvailability', before_row->>'operational_availability',
          'availability', result->>'operational_availability'
        )
        else jsonb_build_object('serviceAddressId', p_entity_id)
      end,
      p_correlation_id,
      'user',
      p_actor_id::text,
      now()
    );
  end if;

  perform app_private.complete_master_data_command(
    'master_data.' || replace(p_resource, '-', '_') || '.update.' || p_entity_id::text,
    p_idempotency_key,
    result
  );
  return result;
end
$$;

revoke all on function api.master_data_update(uuid, text, uuid, jsonb, text, text, uuid)
  from public, anon, authenticated;
grant execute on function api.master_data_update(uuid, text, uuid, jsonb, text, text, uuid)
  to service_role;
