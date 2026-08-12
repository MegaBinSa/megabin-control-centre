-- Phase 3A: offline-capable Driver route execution.

alter table app_private.route_operations
 add column capacity_state text not null default 'normal' check(capacity_state in ('normal','near_capacity')),
 add column completed_by uuid references auth.users on delete set null,
 add column completed_device_id uuid references app_private.vehicle_tracking_devices;

create table app_private.route_operation_stop_executions (
 route_operation_stop_id uuid primary key references app_private.route_operation_stops,
 route_operation_id uuid not null references app_private.route_operations,
 execution_status text not null check(execution_status in ('completed','skipped','issue')),
 outcome_code text not null check(outcome_code in
  ('cleaned','client_requested_skip','drum_empty','drum_unavailable','could_not_access','drum_missing','account_hold','other_issue')),
 actual_drum_count integer check(actual_drum_count is null or actual_drum_count>=0),
 reason text, assignment_revision integer not null, manifest_revision integer not null,
 recorded_by uuid not null references auth.users, recorded_device_id uuid references app_private.vehicle_tracking_devices,
 client_sequence bigint not null, device_timestamp timestamptz not null,
 recorded_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index route_stop_execution_operation_idx on app_private.route_operation_stop_executions(route_operation_id);

create table app_private.route_stop_result_actions (
 action_id uuid primary key, route_operation_id uuid not null references app_private.route_operations,
 route_operation_stop_id uuid not null,
 actor_id uuid not null references auth.users, device_id uuid references app_private.vehicle_tracking_devices,
 assignment_revision integer not null, manifest_revision integer not null,
 client_sequence bigint not null, device_timestamp timestamptz not null,
 idempotency_key text not null, correlation_id uuid not null, payload_version integer not null,
 request_fingerprint text not null, outcome text not null check(outcome in ('accepted','rejected')),
 rejection_code text, result_document jsonb not null, server_received_at timestamptz not null default now(),
 unique(route_operation_id,idempotency_key)
);

create table app_private.route_stop_result_conflicts (
 conflict_id uuid primary key default gen_random_uuid(), route_operation_id uuid not null references app_private.route_operations,
 route_operation_stop_id uuid not null,
 action_id uuid not null, existing_action_id uuid not null references app_private.route_stop_result_actions,
 reason_code text not null, incoming_fingerprint text not null, received_at timestamptz not null default now()
);

create table app_private.route_execution_actions (
 action_id uuid primary key, route_operation_id uuid not null references app_private.route_operations,
 action_type text not null check(action_type in ('capacity','complete')),
 actor_id uuid not null references auth.users, idempotency_key text not null,
 correlation_id uuid not null, request_fingerprint text not null,
 result_document jsonb not null, server_received_at timestamptz not null default now(),
 unique(route_operation_id,idempotency_key)
);

create table app_private.operational_issues (
 operational_issue_id uuid primary key default gen_random_uuid(), route_operation_id uuid not null references app_private.route_operations,
 route_operation_stop_id uuid not null references app_private.route_operation_stops,
 issue_type text not null check(issue_type in ('could_not_access','drum_missing','other_issue')),
 summary text not null, lifecycle_status text not null default 'open' check(lifecycle_status in ('open','resolved')),
 created_at timestamptz not null default now(), created_by uuid references auth.users,
 resolved_at timestamptz, resolved_by uuid references auth.users,
 unique(route_operation_stop_id,issue_type)
);

alter table app_private.route_operation_stop_executions enable row level security;
alter table app_private.route_stop_result_actions enable row level security;
alter table app_private.route_stop_result_conflicts enable row level security;
alter table app_private.operational_issues enable row level security;
alter table app_private.route_execution_actions enable row level security;
revoke all on app_private.route_operation_stop_executions,app_private.route_stop_result_actions,
 app_private.route_stop_result_conflicts,app_private.operational_issues from public,anon,authenticated;
revoke all on app_private.route_execution_actions from public,anon,authenticated;
grant select,insert,update,delete on app_private.route_operation_stop_executions,app_private.route_stop_result_actions,
 app_private.route_stop_result_conflicts,app_private.operational_issues to service_role;
grant select,insert on app_private.route_execution_actions to service_role;

create or replace function app_private.route_execution_progress(p_operation_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('routeOperationId',o.route_operation_id,'lifecycleStatus',o.lifecycle_status,
  'capacityState',o.capacity_state,'totalStops',count(s.*),
  'completedStops',count(x.*) filter(where x.execution_status='completed'),
  'notServicedStops',count(x.*) filter(where x.execution_status in ('skipped','issue')),
  'remainingStops',count(s.*)-count(x.*),'plannedDrums',coalesce(sum(s.planned_drum_units),0),
  'actualDrumsServiced',coalesce(sum(x.actual_drum_count) filter(where x.outcome_code='cleaned'),0),
  'openIssueCount',(select count(*) from app_private.operational_issues i where i.route_operation_id=o.route_operation_id and i.lifecycle_status='open'),
  'completionReady',count(s.*)>0 and count(s.*)=count(x.*))
 from app_private.route_operations o left join app_private.route_operation_stops s on s.route_operation_id=o.route_operation_id
 left join app_private.route_operation_stop_executions x on x.route_operation_stop_id=s.route_operation_stop_id
 where o.route_operation_id=p_operation_id group by o.route_operation_id
$$;

create or replace function api.driver_route_operation_stops(p_actor_id uuid,p_route_operation_id uuid,p_device_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not app_private.route_operation_driver_allowed(p_actor_id,p_route_operation_id,'route_operations.driver.read',p_device_id) then raise exception 'permission denied' using errcode='42501'; end if;
 return jsonb_build_object('progress',app_private.route_execution_progress(p_route_operation_id),'stops',coalesce((select jsonb_agg(
  jsonb_build_object('routeOperationStopId',s.route_operation_stop_id,'sequenceNumber',s.sequence_number,'address',s.address_snapshot,
   'latitude',s.latitude,'longitude',s.longitude,'serviceFlags',s.service_flags,'plannedDrumUnits',s.planned_drum_units,
   'execution',case when x.route_operation_stop_id is null then null else to_jsonb(x) end) order by s.sequence_number)
  from app_private.route_operation_stops s left join app_private.route_operation_stop_executions x using(route_operation_stop_id)
  where s.route_operation_id=p_route_operation_id),'[]'::jsonb)); end $$;

create or replace function api.driver_route_stop_result(p_actor_id uuid,p_route_operation_id uuid,p_action jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o app_private.route_operations%rowtype; s app_private.route_operation_stops%rowtype; prior app_private.route_stop_result_actions%rowtype;
 fp text:=md5(p_action::text); aid uuid:=(p_action->>'actionId')::uuid; sid uuid:=(p_action->>'routeOperationStopId')::uuid;
 idem text:=p_action->>'idempotencyKey'; cid uuid:=(p_action->>'correlationId')::uuid; device uuid:=nullif(p_action->>'deviceId','')::uuid;
 arev integer:=(p_action->>'assignmentRevision')::integer; mrev integer:=(p_action->>'manifestRevision')::integer;
 outcome_code text:=p_action->>'outcome'; actual integer:=nullif(p_action->>'actualDrumCount','')::integer;
 reason text:=nullif(trim(p_action->>'reason'),''); receipt jsonb; reject_code text; conflict uuid; exec_status text; issue_id uuid;
begin
 if not app_private.route_operation_driver_allowed(p_actor_id,p_route_operation_id,'route_operations.driver.act',device) then raise exception 'permission denied' using errcode='42501'; end if;
 select * into prior from app_private.route_stop_result_actions where action_id=aid or (route_operation_id=p_route_operation_id and idempotency_key=idem) order by server_received_at limit 1;
 if prior.action_id is not null then
  if prior.request_fingerprint=fp then return prior.result_document||jsonb_build_object('outcome','duplicate'); end if;
  insert into app_private.route_stop_result_conflicts(route_operation_id,route_operation_stop_id,action_id,existing_action_id,reason_code,incoming_fingerprint)
   values(p_route_operation_id,sid,aid,prior.action_id,'idempotency_key_reused',fp) returning conflict_id into conflict;
  return jsonb_build_object('actionId',aid,'outcome','conflict','correlationId',cid,'conflictId',conflict,'rejectionCode','idempotency_key_reused','serverReceivedAt',now());
 end if;
 select * into o from app_private.route_operations where route_operation_id=p_route_operation_id for update;
 select * into s from app_private.route_operation_stops where route_operation_stop_id=sid;
 if s.route_operation_stop_id is null or s.route_operation_id<>p_route_operation_id then reject_code:='unauthorized_stop';
 elsif arev<>o.assignment_revision then reject_code:='stale_assignment_revision';
 elsif mrev<>o.manifest_revision then reject_code:='stale_manifest';
 elsif o.lifecycle_status not in ('in_progress','suspended') then reject_code:='invalid_lifecycle_transition';
 elsif outcome_code not in ('cleaned','client_requested_skip','drum_empty','drum_unavailable','could_not_access','drum_missing','account_hold','other_issue') then reject_code:='invalid_outcome';
 elsif outcome_code='cleaned' and (actual is null or actual<0) then reject_code:='actual_drum_count_required';
 elsif outcome_code in ('drum_unavailable','could_not_access','drum_missing','account_hold','other_issue') and reason is null then reject_code:='reason_required';
 end if;
 receipt:=jsonb_build_object('actionId',aid,'outcome',case when reject_code is null then 'accepted' else 'rejected' end,'correlationId',cid,'serverReceivedAt',now())||case when reject_code is null then '{}'::jsonb else jsonb_build_object('rejectionCode',reject_code) end;
 insert into app_private.route_stop_result_actions(action_id,route_operation_id,route_operation_stop_id,actor_id,device_id,assignment_revision,manifest_revision,client_sequence,device_timestamp,idempotency_key,correlation_id,payload_version,request_fingerprint,outcome,rejection_code,result_document)
 values(aid,p_route_operation_id,sid,p_actor_id,device,arev,mrev,(p_action->>'clientSequence')::bigint,(p_action->>'deviceTimestamp')::timestamptz,idem,cid,(p_action->>'payloadVersion')::integer,fp,case when reject_code is null then 'accepted' else 'rejected' end,reject_code,receipt);
 if reject_code is not null then return receipt; end if;
 exec_status:=case when outcome_code='cleaned' then 'completed' when outcome_code in ('could_not_access','drum_missing','other_issue') then 'issue' else 'skipped' end;
 insert into app_private.route_operation_stop_executions(route_operation_stop_id,route_operation_id,execution_status,outcome_code,actual_drum_count,reason,assignment_revision,manifest_revision,recorded_by,recorded_device_id,client_sequence,device_timestamp)
 values(sid,p_route_operation_id,exec_status,outcome_code,actual,reason,arev,mrev,p_actor_id,device,(p_action->>'clientSequence')::bigint,(p_action->>'deviceTimestamp')::timestamptz)
 on conflict(route_operation_stop_id) do update set execution_status=excluded.execution_status,outcome_code=excluded.outcome_code,actual_drum_count=excluded.actual_drum_count,reason=excluded.reason,assignment_revision=excluded.assignment_revision,manifest_revision=excluded.manifest_revision,recorded_by=excluded.recorded_by,recorded_device_id=excluded.recorded_device_id,client_sequence=excluded.client_sequence,device_timestamp=excluded.device_timestamp,updated_at=now();
 if exec_status='issue' then insert into app_private.operational_issues(route_operation_id,route_operation_stop_id,issue_type,summary,created_by)
  values(p_route_operation_id,sid,outcome_code,reason,p_actor_id) on conflict(route_operation_stop_id,issue_type) do nothing returning operational_issue_id into issue_id; end if;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values
  ('route_operations.stop_outcome_recorded',p_actor_id,'route-operations','route-operation-stop',sid,cid,jsonb_build_object('outcome',outcome_code,'actualDrumCount',actual));
 if actual is not null then insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state)
  values('route_operations.actual_drum_count_recorded',p_actor_id,'route-operations','route-operation-stop',sid,cid,jsonb_build_object('actualDrumCount',actual)); end if;
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values
  ('route-operations','RouteOperations.StopOutcomeRecorded',1,'route-operation',p_route_operation_id,jsonb_build_object('routeOperationId',p_route_operation_id,'routeOperationStopId',sid,'outcome',outcome_code,'actualDrumCount',actual),cid,'user',p_actor_id::text,now()),
  ('route-operations','RouteOperations.RouteProgressChanged',1,'route-operation',p_route_operation_id,app_private.route_execution_progress(p_route_operation_id),cid,'user',p_actor_id::text,now());
 if issue_id is not null then insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at)
  values('operational-issues','OperationalIssues.IssueCreated',1,'operational-issue',issue_id,jsonb_build_object('operationalIssueId',issue_id,'routeOperationId',p_route_operation_id,'routeOperationStopId',sid,'issueType',outcome_code),cid,'user',p_actor_id::text,now()); end if;
 return receipt||jsonb_build_object('progress',app_private.route_execution_progress(p_route_operation_id),'issueId',issue_id); end $$;

create or replace function api.driver_route_capacity(p_actor_id uuid,p_route_operation_id uuid,p_action jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$ declare o app_private.route_operations%rowtype; prior app_private.route_execution_actions%rowtype; state text:=p_action->>'capacityState'; cid uuid:=(p_action->>'correlationId')::uuid; aid uuid:=(p_action->>'actionId')::uuid; fp text:=md5(p_action::text); result jsonb; begin
 if not app_private.route_operation_driver_allowed(p_actor_id,p_route_operation_id,'route_operations.driver.act',nullif(p_action->>'deviceId','')::uuid) then raise exception 'permission denied' using errcode='42501'; end if;
 select * into prior from app_private.route_execution_actions where action_id=aid or (route_operation_id=p_route_operation_id and idempotency_key=p_action->>'idempotencyKey') order by server_received_at limit 1;
 if prior.action_id is not null then if prior.request_fingerprint=fp then return prior.result_document||jsonb_build_object('outcome','duplicate'); end if; return jsonb_build_object('actionId',aid,'outcome','conflict','rejectionCode','idempotency_key_reused','correlationId',cid); end if;
 select * into o from app_private.route_operations where route_operation_id=p_route_operation_id for update;
 if (p_action->>'assignmentRevision')::integer<>o.assignment_revision then raise exception 'stale_assignment_revision' using errcode='55000'; end if;
 if (p_action->>'manifestRevision')::integer<>o.manifest_revision then raise exception 'stale_manifest' using errcode='55000'; end if;
 if state not in ('normal','near_capacity') then raise exception 'invalid_capacity_state' using errcode='22023'; end if;
 update app_private.route_operations set capacity_state=state,updated_at=now() where route_operation_id=p_route_operation_id returning * into o;
 perform app_private.emit_route_operation_fact(p_actor_id,p_route_operation_id,'route_operations.capacity_state_changed','RouteOperations.CapacityStateChanged',cid,jsonb_build_object('capacityState',state));
 result:=app_private.route_execution_progress(p_route_operation_id)||jsonb_build_object('actionId',aid,'outcome','accepted','correlationId',cid);
 insert into app_private.route_execution_actions(action_id,route_operation_id,action_type,actor_id,idempotency_key,correlation_id,request_fingerprint,result_document) values(aid,p_route_operation_id,'capacity',p_actor_id,p_action->>'idempotencyKey',cid,fp,result);
 return result; end $$;

create or replace function api.driver_route_completion_readiness(p_actor_id uuid,p_route_operation_id uuid,p_device_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not app_private.route_operation_driver_allowed(p_actor_id,p_route_operation_id,'route_operations.driver.read',p_device_id) then raise exception 'permission denied' using errcode='42501'; end if;
 return app_private.route_execution_progress(p_route_operation_id); end $$;

create or replace function api.driver_route_complete(p_actor_id uuid,p_route_operation_id uuid,p_action jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$ declare o app_private.route_operations%rowtype; prior app_private.route_execution_actions%rowtype; progress jsonb; cid uuid:=(p_action->>'correlationId')::uuid; device uuid:=nullif(p_action->>'deviceId','')::uuid; aid uuid:=(p_action->>'actionId')::uuid; fp text:=md5(p_action::text); result jsonb; begin
 if not app_private.route_operation_driver_allowed(p_actor_id,p_route_operation_id,'route_operations.driver.act',device) then raise exception 'permission denied' using errcode='42501'; end if;
 select * into prior from app_private.route_execution_actions where action_id=aid or (route_operation_id=p_route_operation_id and idempotency_key=p_action->>'idempotencyKey') order by server_received_at limit 1;
 if prior.action_id is not null then if prior.request_fingerprint=fp then return prior.result_document||jsonb_build_object('outcome','duplicate'); end if; return jsonb_build_object('actionId',aid,'outcome','conflict','rejectionCode','idempotency_key_reused','correlationId',cid); end if;
 select * into o from app_private.route_operations where route_operation_id=p_route_operation_id for update;
 if (p_action->>'assignmentRevision')::integer<>o.assignment_revision then raise exception 'stale_assignment_revision' using errcode='55000'; end if;
 if (p_action->>'manifestRevision')::integer<>o.manifest_revision then raise exception 'stale_manifest' using errcode='55000'; end if;
 progress:=app_private.route_execution_progress(p_route_operation_id);
 if o.lifecycle_status not in ('in_progress','suspended') then raise exception 'invalid_lifecycle_transition' using errcode='55000'; end if;
 if not (progress->>'completionReady')::boolean then raise exception 'incomplete_stops' using errcode='55000'; end if;
 update app_private.route_operations set lifecycle_status='completed',completed_at=now(),completed_by=p_actor_id,completed_device_id=device,updated_at=now() where route_operation_id=p_route_operation_id;
 perform app_private.emit_route_operation_fact(p_actor_id,p_route_operation_id,'route_operations.completed','RouteOperations.RouteCompleted',cid,jsonb_build_object('actualDrumsServiced',progress->'actualDrumsServiced'));
 result:=app_private.route_execution_progress(p_route_operation_id)||jsonb_build_object('actionId',aid,'outcome','accepted','correlationId',cid);
 insert into app_private.route_execution_actions(action_id,route_operation_id,action_type,actor_id,idempotency_key,correlation_id,request_fingerprint,result_document) values(aid,p_route_operation_id,'complete',p_actor_id,p_action->>'idempotencyKey',cid,fp,result);
 return result; end $$;

create or replace function api.office_route_execution_progress(p_actor_id uuid,p_route_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare region_id uuid; begin
 select service_region_id into region_id from app_private.route_operations where route_operation_id=p_route_operation_id;
 if region_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.require_route_operations_access(p_actor_id,'route_operations.read',region_id);
 return jsonb_build_object('progress',app_private.route_execution_progress(p_route_operation_id),'stops',coalesce((select jsonb_agg(to_jsonb(x) order by s.sequence_number) from app_private.route_operation_stops s left join app_private.route_operation_stop_executions x using(route_operation_stop_id) where s.route_operation_id=p_route_operation_id),'[]'::jsonb)); end $$;

grant execute on function api.driver_route_operation_stops(uuid,uuid,uuid),api.driver_route_stop_result(uuid,uuid,jsonb),
 api.driver_route_capacity(uuid,uuid,jsonb),api.driver_route_completion_readiness(uuid,uuid,uuid),api.driver_route_complete(uuid,uuid,jsonb),
 api.office_route_execution_progress(uuid,uuid) to service_role;
