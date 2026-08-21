-- Lifecycle remains authoritative on route_operations. The immutable manifest
-- content is enriched at read time with service-timezone start eligibility so a
-- Driver is never offered a transition that the action RPC must reject.
create or replace function app_private.route_operation_start_eligible(p_operation_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select o.route_date = (current_timestamp at time zone od.timezone)::date
  from app_private.route_operations o
  join app_private.operational_days od using (operational_day_id)
  where o.route_operation_id = p_operation_id
$$;

create or replace function app_private.route_operation_manifest_document(
  p_operation_id uuid,
  p_revision integer default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select m.manifest_document
    || jsonb_build_object(
      'lifecycleStatus', o.lifecycle_status,
      'serviceTimezone', od.timezone,
      'startEligibility', jsonb_build_object(
        'eligible', app_private.route_operation_start_eligible(o.route_operation_id),
        'reasonCode', case
          when o.route_date <> (current_timestamp at time zone od.timezone)::date then 'route_date_mismatch'
          else null
        end
      ),
      'stops', coalesce((
        select jsonb_agg(jsonb_build_object(
          'routeOperationStopId', s.route_operation_stop_id,
          'sourcePlannedRouteStopId', s.source_planned_route_stop_id,
          'sequenceNumber', s.sequence_number,
          'serviceAddressId', s.service_address_id,
          'territoryId', s.territory_id,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'address', s.address_snapshot,
          'serviceFlags', s.service_flags,
          'plannedDrumUnits', s.planned_drum_units,
          'plannedDurationMinutes', s.planned_duration_minutes
        ) order by s.sequence_number)
        from app_private.route_operation_stops s
        where s.route_operation_id = m.route_operation_id
      ), '[]'::jsonb)
    )
  from app_private.route_operation_manifests m
  join app_private.route_operations o using (route_operation_id)
  join app_private.operational_days od using (operational_day_id)
  where m.route_operation_id = p_operation_id
    and m.manifest_revision = coalesce(p_revision, o.manifest_revision)
$$;

-- Preserve the established lifecycle and idempotency rules while sharing the
-- exact service-timezone date predicate exposed by the manifest projection.
create or replace function api.driver_route_operation_action(
  p_actor_id uuid,
  p_route_operation_id uuid,
  p_action jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o app_private.route_operations%rowtype;
  prior app_private.route_operation_actions%rowtype;
  fp text := md5(p_action::text);
  aid uuid := (p_action->>'actionId')::uuid;
  idem text := p_action->>'idempotencyKey';
  cid uuid := (p_action->>'correlationId')::uuid;
  atype text := p_action->>'actionType';
  rev integer := (p_action->>'assignmentRevision')::integer;
  device uuid := nullif(p_action->>'deviceId', '')::uuid;
  receipt jsonb;
  reject_code text;
  target text;
  conflict uuid;
begin
  if not app_private.route_operation_driver_allowed(
    p_actor_id,
    p_route_operation_id,
    'route_operations.driver.act',
    device
  ) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select * into prior
  from app_private.route_operation_actions
  where action_id = aid
    or (route_operation_id = p_route_operation_id and idempotency_key = idem)
  order by server_received_at
  limit 1;

  if prior.action_id is not null then
    if prior.request_fingerprint = fp then
      return prior.result_document || jsonb_build_object('outcome', 'duplicate');
    end if;
    insert into app_private.route_operation_action_conflicts(
      route_operation_id,
      action_id,
      existing_action_id,
      incoming_fingerprint,
      reason_code
    ) values (
      p_route_operation_id,
      aid,
      prior.action_id,
      fp,
      'idempotency_key_reused'
    ) returning conflict_id into conflict;
    return jsonb_build_object(
      'actionId', aid,
      'serverReceivedAt', now(),
      'outcome', 'conflict',
      'correlationId', cid,
      'conflictId', conflict,
      'rejectionCode', 'idempotency_key_reused'
    );
  end if;

  select * into o
  from app_private.route_operations
  where route_operation_id = p_route_operation_id
  for update;

  if rev <> o.assignment_revision then
    reject_code := 'stale_assignment_revision';
  elsif o.lifecycle_status = 'superseded' then
    reject_code := 'operation_superseded';
  elsif o.lifecycle_status = 'cancelled' then
    reject_code := 'operation_cancelled';
  elsif atype = 'accept' and o.lifecycle_status = 'available' then
    target := 'accepted';
  elsif atype = 'start' and o.lifecycle_status = 'accepted'
    and app_private.route_operation_start_eligible(o.route_operation_id) then
    target := 'in_progress';
  elsif atype = 'suspend' and o.lifecycle_status = 'in_progress' then
    target := 'suspended';
  elsif atype = 'resume' and o.lifecycle_status = 'suspended' then
    target := 'in_progress';
  else
    reject_code := 'invalid_lifecycle_transition';
  end if;

  receipt := jsonb_build_object(
    'actionId', aid,
    'serverReceivedAt', now(),
    'outcome', case when reject_code is null then 'accepted' else 'rejected' end,
    'correlationId', cid
  ) || case
    when reject_code is null then '{}'::jsonb
    else jsonb_build_object('rejectionCode', reject_code)
  end;

  insert into app_private.route_operation_actions(
    action_id,
    route_operation_id,
    assignment_revision,
    device_id,
    actor_id,
    client_sequence,
    device_timestamp,
    idempotency_key,
    correlation_id,
    action_type,
    payload_version,
    payload,
    request_fingerprint,
    outcome,
    rejection_code,
    result_document
  ) values (
    aid,
    p_route_operation_id,
    rev,
    device,
    p_actor_id,
    (p_action->>'clientSequence')::bigint,
    (p_action->>'deviceTimestamp')::timestamptz,
    idem,
    cid,
    atype,
    (p_action->>'payloadVersion')::integer,
    coalesce(p_action->'payload', '{}'),
    fp,
    case when reject_code is null then 'accepted' else 'rejected' end,
    reject_code,
    receipt
  );

  if reject_code is not null then
    return receipt;
  end if;

  update app_private.route_operations
  set lifecycle_status = target,
    accepted_at = case when atype = 'accept' then now() else accepted_at end,
    accepted_by = case when atype = 'accept' then p_actor_id else accepted_by end,
    started_at = case when atype = 'start' then now() else started_at end,
    updated_at = now()
  where route_operation_id = p_route_operation_id
  returning * into o;

  perform app_private.emit_route_operation_fact(
    p_actor_id,
    o.route_operation_id,
    case atype
      when 'accept' then 'route_operations.assignment_accepted'
      when 'start' then 'route_operations.started'
      when 'suspend' then 'route_operations.suspended'
      else 'route_operations.resumed'
    end,
    case atype
      when 'accept' then 'RouteOperations.AssignmentAccepted'
      when 'start' then 'RouteOperations.RouteStarted'
      when 'suspend' then 'RouteOperations.RouteSuspended'
      else 'RouteOperations.RouteResumed'
    end,
    cid,
    jsonb_build_object('assignmentRevision', o.assignment_revision, 'actionId', aid)
  );
  return receipt;
end
$$;

-- Current assignments retain active execution across midnight, but omit expired
-- not-started and completed work. Historical operations remain stored and
-- available to Office; they no longer mask the next actionable Driver route.
create or replace function api.driver_route_operations_current(p_actor_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'routeOperationId', o.route_operation_id,
    'routeDate', o.route_date,
    'lifecycleStatus', o.lifecycle_status,
    'assignmentRevision', o.assignment_revision,
    'manifestRevision', o.manifest_revision,
    'teamId', o.current_team_id,
    'vehicleId', o.current_vehicle_id
  ) order by o.route_date, o.created_at), '[]'::jsonb)
  from app_private.route_operations o
  join app_private.operational_days od using (operational_day_id)
  where o.lifecycle_status in ('available', 'accepted', 'in_progress', 'suspended')
    and (
      o.lifecycle_status in ('in_progress', 'suspended')
      or o.route_date >= (current_timestamp at time zone od.timezone)::date
    )
    and app_private.route_operation_driver_allowed(
      p_actor_id,
      o.route_operation_id,
      'route_operations.driver.read',
      null
    )
$$;

revoke all on function app_private.route_operation_start_eligible(uuid),
  app_private.route_operation_manifest_document(uuid, integer)
from public, anon, authenticated;
revoke all on function api.driver_route_operations_current(uuid)
from public, anon;
grant execute on function api.driver_route_operations_current(uuid) to authenticated, service_role;
