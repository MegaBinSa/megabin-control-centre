-- Phase 2C: authoritative day-of-operation execution boundary.

insert into app_private.permissions(permission_key,description) values
 ('route_operations.read','Read route operations within assigned regions'),
 ('route_operations.create','Hand published route versions to operations'),
 ('route_operations.assign','Assign prepared route operations'),
 ('route_operations.reassign','Reassign route operations before execution'),
 ('route_operations.control','Cancel or supersede route operations'),
 ('route_operations.driver.read','Read currently assigned driver manifests'),
 ('route_operations.driver.act','Submit actions for currently assigned route operations')
on conflict do nothing;

insert into app_private.role_permissions(role_id,permission_key)
select r.role_id,p.permission_key from app_private.roles r cross join app_private.permissions p
where r.role_key in ('director_admin','operations_manager') and p.permission_key like 'route_operations.%'
on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
select r.role_id,p.permission_key from app_private.roles r cross join app_private.permissions p
where r.role_key='office_admin' and p.permission_key in
 ('route_operations.read','route_operations.create','route_operations.assign','route_operations.reassign','route_operations.control')
on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
select r.role_id,p.permission_key from app_private.roles r cross join app_private.permissions p
where r.role_key='driver_team' and p.permission_key in ('route_operations.driver.read','route_operations.driver.act')
on conflict do nothing;

create table app_private.route_operations (
 route_operation_id uuid primary key default gen_random_uuid(),
 operational_day_id uuid not null references app_private.operational_days,
 published_route_version_id uuid not null references app_private.route_versions,
 planned_route_id uuid not null references app_private.planned_routes,
 service_region_id uuid not null references app_private.service_regions,
 route_date date not null,
 source_roster_entry_id uuid not null references app_private.daily_roster_entries,
 source_roster_entry_version integer not null,
 planned_team_id uuid not null references app_private.teams,
 planned_vehicle_id uuid not null references app_private.vehicles,
 current_team_id uuid not null references app_private.teams,
 current_vehicle_id uuid not null references app_private.vehicles,
 current_device_id uuid references app_private.vehicle_tracking_devices,
 lifecycle_status text not null default 'available' check(lifecycle_status in
  ('prepared','assigned','available','accepted','in_progress','suspended','completed','cancelled','superseded','archived')),
 assignment_revision integer not null default 1 check(assignment_revision>0),
 manifest_revision integer not null default 1 check(manifest_revision>0),
 operationally_changed boolean not null default false,
 created_by uuid references auth.users on delete set null,
 created_at timestamptz not null default now(), available_at timestamptz,
 accepted_at timestamptz, accepted_by uuid references auth.users on delete set null,
 started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
 superseded_at timestamptz, archived_at timestamptz,
 superseded_by_operation_id uuid references app_private.route_operations,
 updated_at timestamptz not null default now(),
 unique(published_route_version_id,planned_route_id), unique(planned_route_id)
);
create index route_operations_day_idx on app_private.route_operations(service_region_id,route_date,lifecycle_status);
create index route_operations_assignment_idx on app_private.route_operations(current_team_id,route_date,lifecycle_status);

create table app_private.route_operation_assignments (
 route_operation_assignment_id uuid primary key default gen_random_uuid(),
 route_operation_id uuid not null references app_private.route_operations on delete cascade,
 assignment_revision integer not null, team_id uuid not null references app_private.teams,
 vehicle_id uuid not null references app_private.vehicles,
 device_id uuid references app_private.vehicle_tracking_devices,
 reason text not null, assigned_by uuid references auth.users on delete set null,
 assigned_at timestamptz not null default now(), revoked_at timestamptz,
 revoked_by uuid references auth.users on delete set null, revocation_reason text,
 unique(route_operation_id,assignment_revision)
);
create index route_operation_assignments_current_idx on app_private.route_operation_assignments(route_operation_id,assignment_revision desc);

create table app_private.route_operation_assignment_staff (
 route_operation_assignment_id uuid not null references app_private.route_operation_assignments on delete cascade,
 staff_id uuid not null references app_private.staff,
 assignment_role text not null,
 primary key(route_operation_assignment_id,staff_id)
);

create table app_private.route_operation_manifests (
 route_operation_id uuid not null references app_private.route_operations on delete cascade,
 manifest_revision integer not null,
 manifest_document jsonb not null check(jsonb_typeof(manifest_document)='object'),
 created_at timestamptz not null default now(), created_by uuid references auth.users on delete set null,
 primary key(route_operation_id,manifest_revision)
);

create table app_private.route_operation_stops (
 route_operation_stop_id uuid primary key default gen_random_uuid(),
 route_operation_id uuid not null references app_private.route_operations on delete cascade,
 source_planned_route_stop_id uuid not null references app_private.planned_route_stops,
 sequence_number integer not null check(sequence_number>0),
 service_address_id uuid not null references app_private.service_addresses,
 territory_id uuid references app_private.territories,
 latitude numeric(9,6) not null, longitude numeric(9,6) not null,
 address_snapshot jsonb not null, service_flags jsonb not null default '{}',
 planned_drum_units integer not null check(planned_drum_units>0),
 planned_duration_minutes integer not null check(planned_duration_minutes>0),
 created_manifest_revision integer not null default 1,
 unique(route_operation_id,source_planned_route_stop_id), unique(route_operation_id,sequence_number)
);

create table app_private.route_operation_actions (
 action_id uuid primary key, route_operation_id uuid not null references app_private.route_operations,
 assignment_revision integer not null, device_id uuid references app_private.vehicle_tracking_devices,
 actor_id uuid not null references auth.users, client_sequence bigint not null check(client_sequence>=0),
 device_timestamp timestamptz not null, server_received_at timestamptz not null default now(),
 idempotency_key text not null check(char_length(trim(idempotency_key))>0), correlation_id uuid not null,
 action_type text not null check(action_type in ('accept','start','suspend','resume')),
 payload_version integer not null check(payload_version>0), payload jsonb not null default '{}',
 request_fingerprint text not null, outcome text not null check(outcome in ('accepted','rejected')),
 rejection_code text, result_document jsonb not null,
 unique(route_operation_id,idempotency_key)
);
create index route_operation_actions_operation_idx on app_private.route_operation_actions(route_operation_id,server_received_at);

create table app_private.route_operation_action_conflicts (
 conflict_id uuid primary key default gen_random_uuid(), route_operation_id uuid not null references app_private.route_operations,
 action_id uuid not null, existing_action_id uuid not null references app_private.route_operation_actions,
 incoming_fingerprint text not null, reason_code text not null, received_at timestamptz not null default now()
);

alter table app_private.route_operations enable row level security;
alter table app_private.route_operation_assignments enable row level security;
alter table app_private.route_operation_assignment_staff enable row level security;
alter table app_private.route_operation_manifests enable row level security;
alter table app_private.route_operation_stops enable row level security;
alter table app_private.route_operation_actions enable row level security;
alter table app_private.route_operation_action_conflicts enable row level security;
revoke all on app_private.route_operations,app_private.route_operation_assignments,
 app_private.route_operation_assignment_staff,app_private.route_operation_manifests,
 app_private.route_operation_stops,app_private.route_operation_actions,
 app_private.route_operation_action_conflicts from public,anon,authenticated;
grant select,insert,update,delete on app_private.route_operations,app_private.route_operation_assignments,
 app_private.route_operation_assignment_staff,app_private.route_operation_manifests,
 app_private.route_operation_stops,app_private.route_operation_actions,
 app_private.route_operation_action_conflicts to service_role;

create or replace function app_private.require_route_operations_access(p_actor_id uuid,p_permission text,p_region_id uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not app_private.user_has_region_permission(p_actor_id,p_permission,p_region_id) then
  raise exception 'permission denied' using errcode='42501';
 end if;
end $$;

create or replace function app_private.route_operation_driver_allowed(p_actor_id uuid,p_operation_id uuid,p_permission text,p_device_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from app_private.route_operations o
  join app_private.route_operation_assignments a on a.route_operation_id=o.route_operation_id and a.assignment_revision=o.assignment_revision
  join app_private.route_operation_assignment_staff ast on ast.route_operation_assignment_id=a.route_operation_assignment_id
  join app_private.staff s on s.staff_id=ast.staff_id and s.user_id=p_actor_id and s.is_active
  join public.user_profiles up on up.user_id=p_actor_id and up.is_active
  join app_private.user_roles ur on ur.user_id=up.user_id
  join app_private.role_permissions rp on rp.role_id=ur.role_id and rp.permission_key=p_permission
  where o.route_operation_id=p_operation_id and (a.revoked_at is null or o.lifecycle_status in ('cancelled','superseded'))
   and (o.current_device_id is null or o.current_device_id=p_device_id)
   and exists(select 1 from app_private.user_access_scopes uas where uas.user_id=p_actor_id and
    (uas.scope_kind='global' or (uas.scope_kind='service_region' and uas.scope_id=o.service_region_id)
     or (uas.scope_kind='team' and uas.scope_id=o.current_team_id)))
 )
$$;

create or replace function app_private.route_operation_manifest_document(p_operation_id uuid,p_revision integer default null)
returns jsonb language sql stable set search_path='' as $$
 select m.manifest_document||jsonb_build_object('stops',coalesce((select jsonb_agg(jsonb_build_object(
  'routeOperationStopId',s.route_operation_stop_id,'sourcePlannedRouteStopId',s.source_planned_route_stop_id,
  'sequenceNumber',s.sequence_number,'serviceAddressId',s.service_address_id,'territoryId',s.territory_id,
  'latitude',s.latitude,'longitude',s.longitude,'address',s.address_snapshot,'serviceFlags',s.service_flags,
  'plannedDrumUnits',s.planned_drum_units,'plannedDurationMinutes',s.planned_duration_minutes)
  order by s.sequence_number) from app_private.route_operation_stops s where s.route_operation_id=m.route_operation_id),'[]'::jsonb))
 from app_private.route_operation_manifests m join app_private.route_operations o on o.route_operation_id=m.route_operation_id
 where m.route_operation_id=p_operation_id and m.manifest_revision=coalesce(p_revision,o.manifest_revision)
$$;

create or replace function app_private.build_route_operation_manifest(p_operation_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('routeOperationId',o.route_operation_id,'routeDate',o.route_date,
  'manifestRevision',o.manifest_revision,'assignmentRevision',o.assignment_revision,'lifecycleStatus',o.lifecycle_status,
  'team',jsonb_build_object('teamId',o.current_team_id,'name',t.name),
  'vehicle',jsonb_build_object('vehicleId',o.current_vehicle_id,'displayName',v.display_name,'registrationReference',v.registration_reference),
  'deviceId',o.current_device_id,'startDepot',jsonb_build_object('depotId',pr.start_depot_id,'name',d.name,'latitude',d.latitude,'longitude',d.longitude),
  'publishedRouteVersionId',o.published_route_version_id,'plannedRouteId',o.planned_route_id,
  'plannedDistanceMetres',pr.planned_distance_metres,'plannedDurationMinutes',pr.planned_duration_minutes,
  'plannedStartAt',pr.planned_start_at,'plannedEndAt',pr.planned_end_at,
  'routeGeometry',pr.constraint_flags->'geometry',
  'staff',coalesce((select jsonb_agg(jsonb_build_object('staffId',s.staff_id,'displayName',s.display_name,'role',ast.assignment_role) order by s.display_name)
    from app_private.route_operation_assignments a join app_private.route_operation_assignment_staff ast on ast.route_operation_assignment_id=a.route_operation_assignment_id
    join app_private.staff s on s.staff_id=ast.staff_id where a.route_operation_id=o.route_operation_id and a.assignment_revision=o.assignment_revision),'[]'::jsonb))
 from app_private.route_operations o join app_private.planned_routes pr on pr.planned_route_id=o.planned_route_id
 join app_private.teams t on t.team_id=o.current_team_id join app_private.vehicles v on v.vehicle_id=o.current_vehicle_id
 join app_private.depots d on d.depot_id=pr.start_depot_id where o.route_operation_id=p_operation_id
$$;

create or replace function app_private.route_operation_document(p_operation_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(o)||jsonb_build_object('manifest',app_private.route_operation_manifest_document(o.route_operation_id),
  'assignmentHistory',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('staff',coalesce((select jsonb_agg(to_jsonb(ast)) from app_private.route_operation_assignment_staff ast where ast.route_operation_assignment_id=a.route_operation_assignment_id),'[]'::jsonb)) order by a.assignment_revision desc)
  from app_private.route_operation_assignments a where a.route_operation_id=o.route_operation_id),'[]'::jsonb))
 from app_private.route_operations o where o.route_operation_id=p_operation_id
$$;

create or replace function app_private.emit_route_operation_fact(p_actor_id uuid,p_operation_id uuid,p_action text,p_event text,p_correlation_id uuid,p_payload jsonb default '{}')
returns void language plpgsql security definer set search_path='' as $$ begin
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state)
 values(p_action,p_actor_id,'route-operations','route-operation',p_operation_id,p_correlation_id,p_payload);
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at)
 values('route-operations',p_event,1,'route-operation',p_operation_id,p_payload||jsonb_build_object('routeOperationId',p_operation_id),p_correlation_id,'user',p_actor_id::text,now());
end $$;

create or replace function api.route_operations_handoff(p_actor_id uuid,p_published_route_version_id uuid,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v app_private.route_versions%rowtype; p app_private.route_plans%rowtype; d app_private.operational_days%rowtype; r record; op app_private.route_operations%rowtype; aid uuid;
begin
 select * into v from app_private.route_versions where route_version_id=p_published_route_version_id;
 if v.route_version_id is null then raise exception 'not found' using errcode='P0002'; end if;
 select * into p from app_private.route_plans where route_plan_id=v.route_plan_id; select * into d from app_private.operational_days where operational_day_id=p.operational_day_id;
 perform app_private.require_route_operations_access(p_actor_id,'route_operations.create',p.service_region_id);
 if v.version_status<>'published' or p.current_published_version_id<>v.route_version_id then raise exception 'published_route_version_required' using errcode='55000'; end if;
 for r in select pr.*,re.operational_day_id,re.team_id roster_team_id,re.assigned_vehicle_id roster_vehicle_id,re.version current_roster_version
  from app_private.planned_routes pr join app_private.daily_roster_entries re on re.daily_roster_entry_id=pr.daily_roster_entry_id
  where pr.route_version_id=v.route_version_id order by pr.route_sequence loop
  if r.operational_day_id<>d.operational_day_id or r.roster_team_id<>r.team_id or r.roster_vehicle_id<>r.vehicle_id or r.current_roster_version<>r.roster_entry_version then
   raise exception 'roster_assignment_mismatch' using errcode='55000';
  end if;
  insert into app_private.route_operations(operational_day_id,published_route_version_id,planned_route_id,service_region_id,route_date,
   source_roster_entry_id,source_roster_entry_version,planned_team_id,planned_vehicle_id,current_team_id,current_vehicle_id,available_at,created_by)
  values(d.operational_day_id,v.route_version_id,r.planned_route_id,p.service_region_id,d.service_date,r.daily_roster_entry_id,r.roster_entry_version,
   r.team_id,r.vehicle_id,r.team_id,r.vehicle_id,now(),p_actor_id) on conflict(published_route_version_id,planned_route_id) do nothing returning * into op;
  if op.route_operation_id is not null then
   insert into app_private.route_operation_assignments(route_operation_id,assignment_revision,team_id,vehicle_id,reason,assigned_by)
    values(op.route_operation_id,1,r.team_id,r.vehicle_id,'Published route handoff',p_actor_id) returning route_operation_assignment_id into aid;
   insert into app_private.route_operation_assignment_staff(route_operation_assignment_id,staff_id,assignment_role)
    select aid,a.staff_id,a.assignment_role from app_private.daily_roster_staff_assignments a where a.daily_roster_entry_id=r.daily_roster_entry_id;
   insert into app_private.route_operation_stops(route_operation_id,source_planned_route_stop_id,sequence_number,service_address_id,territory_id,latitude,longitude,address_snapshot,service_flags,planned_drum_units,planned_duration_minutes)
    select op.route_operation_id,s.planned_route_stop_id,s.sequence_number,s.service_address_id,s.territory_id,s.latitude,s.longitude,s.address_snapshot,s.service_flags,s.drum_units,s.planned_duration_minutes
    from app_private.planned_route_stops s where s.planned_route_id=r.planned_route_id;
   insert into app_private.route_operation_manifests values(op.route_operation_id,1,app_private.build_route_operation_manifest(op.route_operation_id),now(),p_actor_id);
   perform app_private.emit_route_operation_fact(p_actor_id,op.route_operation_id,'route_operations.handoff_created','RouteOperations.RouteOperationCreated',p_correlation_id,
    jsonb_build_object('publishedRouteVersionId',v.route_version_id,'plannedRouteId',r.planned_route_id,'assignmentRevision',1,'manifestRevision',1));
   perform app_private.emit_route_operation_fact(p_actor_id,op.route_operation_id,'route_operations.assignment_made','RouteOperations.RouteAssigned',p_correlation_id,
    jsonb_build_object('teamId',r.team_id,'vehicleId',r.vehicle_id,'assignmentRevision',1));
  end if;
  op.route_operation_id:=null;
 end loop;
 return (select jsonb_build_object('publishedRouteVersionId',v.route_version_id,'operations',coalesce(jsonb_agg(app_private.route_operation_document(o.route_operation_id) order by o.created_at),'[]'::jsonb))
  from app_private.route_operations o where o.published_route_version_id=v.route_version_id);
end $$;

create or replace function api.route_operations_list(p_actor_id uuid,p_service_region_id uuid,p_service_date date)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform app_private.require_route_operations_access(p_actor_id,'route_operations.read',p_service_region_id);
 return coalesce((select jsonb_agg(app_private.route_operation_document(o.route_operation_id) order by o.created_at)
  from app_private.route_operations o where o.service_region_id=p_service_region_id and o.route_date=p_service_date),'[]'::jsonb); end $$;

create or replace function api.route_operation_get(p_actor_id uuid,p_route_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare o app_private.route_operations%rowtype; begin
 select * into o from app_private.route_operations where route_operation_id=p_route_operation_id;
 if o.route_operation_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.require_route_operations_access(p_actor_id,'route_operations.read',o.service_region_id);
 return app_private.route_operation_document(o.route_operation_id); end $$;

create or replace function api.route_operation_reassign(p_actor_id uuid,p_route_operation_id uuid,p_expected_assignment_revision integer,p_team_id uuid,p_vehicle_id uuid,p_staff_ids uuid[],p_device_id uuid,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o app_private.route_operations%rowtype; team_region uuid; vehicle_region uuid; aid uuid; sid uuid;
begin
 select * into o from app_private.route_operations where route_operation_id=p_route_operation_id for update;
 if o.route_operation_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.require_route_operations_access(p_actor_id,'route_operations.reassign',o.service_region_id);
 if o.lifecycle_status not in ('prepared','assigned','available') then raise exception 'invalid_lifecycle_transition' using errcode='55000'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'reassignment_reason_required' using errcode='22023'; end if;
 if o.assignment_revision<>p_expected_assignment_revision then raise exception 'stale_assignment_revision' using errcode='40001'; end if;
 select service_region_id into team_region from app_private.teams where team_id=p_team_id and is_active;
 select service_region_id into vehicle_region from app_private.vehicles where vehicle_id=p_vehicle_id and is_active and operational_availability not in ('maintenance','unavailable','retired');
 if team_region is distinct from o.service_region_id or vehicle_region is distinct from o.service_region_id then raise exception 'incompatible_assignment' using errcode='22023'; end if;
 if p_device_id is not null and not exists(select 1 from app_private.vehicle_tracking_devices where vehicle_tracking_device_id=p_device_id and vehicle_id=p_vehicle_id and retired_at is null) then raise exception 'wrong_device' using errcode='22023'; end if;
 if coalesce(cardinality(p_staff_ids),0)=0 or exists(select 1 from unnest(p_staff_ids) x where not exists(select 1 from app_private.staff s where s.staff_id=x and s.is_active)) then raise exception 'incompatible_staff' using errcode='22023'; end if;
 if exists(select 1 from app_private.vehicle_availability_windows w where w.vehicle_id=p_vehicle_id and o.route_date between w.starts_at::date and w.ends_at::date) then raise exception 'vehicle_unavailable' using errcode='22023'; end if;
 update app_private.route_operation_assignments set revoked_at=now(),revoked_by=p_actor_id,revocation_reason=p_reason where route_operation_id=o.route_operation_id and assignment_revision=o.assignment_revision;
 update app_private.route_operations set current_team_id=p_team_id,current_vehicle_id=p_vehicle_id,current_device_id=p_device_id,
  assignment_revision=assignment_revision+1,manifest_revision=manifest_revision+1,updated_at=now() where route_operation_id=o.route_operation_id returning * into o;
 insert into app_private.route_operation_assignments(route_operation_id,assignment_revision,team_id,vehicle_id,device_id,reason,assigned_by)
  values(o.route_operation_id,o.assignment_revision,p_team_id,p_vehicle_id,p_device_id,p_reason,p_actor_id) returning route_operation_assignment_id into aid;
 foreach sid in array p_staff_ids loop insert into app_private.route_operation_assignment_staff values(aid,sid,(select operational_role from app_private.staff where staff_id=sid)); end loop;
 insert into app_private.route_operation_manifests values(o.route_operation_id,o.manifest_revision,app_private.build_route_operation_manifest(o.route_operation_id),now(),p_actor_id);
 perform app_private.emit_route_operation_fact(p_actor_id,o.route_operation_id,'route_operations.reassigned','RouteOperations.RouteReassigned',p_correlation_id,jsonb_build_object('assignmentRevision',o.assignment_revision,'teamId',p_team_id,'vehicleId',p_vehicle_id,'reason',p_reason));
 perform app_private.emit_route_operation_fact(p_actor_id,o.route_operation_id,'route_operations.manifest_revision_changed','RouteOperations.ManifestRevisionChanged',p_correlation_id,jsonb_build_object('manifestRevision',o.manifest_revision));
 return app_private.route_operation_document(o.route_operation_id); end $$;

create or replace function api.route_operation_supersede(p_actor_id uuid,p_route_operation_id uuid,p_replacement_operation_id uuid,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare o app_private.route_operations%rowtype; n app_private.route_operations%rowtype; begin
 select * into o from app_private.route_operations where route_operation_id=p_route_operation_id for update;
 if o.route_operation_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.require_route_operations_access(p_actor_id,'route_operations.control',o.service_region_id);
 if o.lifecycle_status in ('accepted','in_progress','suspended','completed') then raise exception 'operation_already_started' using errcode='55000'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'reason_required' using errcode='22023'; end if;
 select * into n from app_private.route_operations where route_operation_id=p_replacement_operation_id;
 if n.route_operation_id is null or n.service_region_id<>o.service_region_id or n.operational_day_id<>o.operational_day_id or n.published_route_version_id=o.published_route_version_id then raise exception 'invalid_replacement_operation' using errcode='22023'; end if;
 update app_private.route_operations set lifecycle_status='superseded',superseded_at=now(),superseded_by_operation_id=n.route_operation_id,updated_at=now() where route_operation_id=o.route_operation_id returning * into o;
 update app_private.route_operation_assignments set revoked_at=now(),revoked_by=p_actor_id,revocation_reason=p_reason where route_operation_id=o.route_operation_id and revoked_at is null;
 perform app_private.emit_route_operation_fact(p_actor_id,o.route_operation_id,'route_operations.superseded','RouteOperations.RouteSuperseded',p_correlation_id,jsonb_build_object('replacementOperationId',n.route_operation_id,'reason',p_reason));
 return app_private.route_operation_document(o.route_operation_id); end $$;

create or replace function api.route_operation_cancel(p_actor_id uuid,p_route_operation_id uuid,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare o app_private.route_operations%rowtype; begin
 select * into o from app_private.route_operations where route_operation_id=p_route_operation_id for update;
 if o.route_operation_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.require_route_operations_access(p_actor_id,'route_operations.control',o.service_region_id);
 if o.lifecycle_status not in ('prepared','assigned','available') then raise exception 'invalid_lifecycle_transition' using errcode='55000'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'reason_required' using errcode='22023'; end if;
 update app_private.route_operations set lifecycle_status='cancelled',cancelled_at=now(),updated_at=now() where route_operation_id=o.route_operation_id returning * into o;
 update app_private.route_operation_assignments set revoked_at=now(),revoked_by=p_actor_id,revocation_reason=p_reason where route_operation_id=o.route_operation_id and revoked_at is null;
 perform app_private.emit_route_operation_fact(p_actor_id,o.route_operation_id,'route_operations.cancelled','RouteOperations.RouteCancelled',p_correlation_id,jsonb_build_object('reason',p_reason));
 return app_private.route_operation_document(o.route_operation_id); end $$;

create or replace function api.route_operation_assignment_history(p_actor_id uuid,p_route_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare region_id uuid; begin
 select service_region_id into region_id from app_private.route_operations where route_operation_id=p_route_operation_id;
 if region_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.require_route_operations_access(p_actor_id,'route_operations.read',region_id);
 return coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('staff',coalesce((select jsonb_agg(to_jsonb(ast)) from app_private.route_operation_assignment_staff ast where ast.route_operation_assignment_id=a.route_operation_assignment_id),'[]'::jsonb)) order by a.assignment_revision desc) from app_private.route_operation_assignments a where a.route_operation_id=p_route_operation_id),'[]'::jsonb); end $$;

create or replace function api.driver_route_operations_current(p_actor_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('routeOperationId',o.route_operation_id,'routeDate',o.route_date,'lifecycleStatus',o.lifecycle_status,
  'assignmentRevision',o.assignment_revision,'manifestRevision',o.manifest_revision,'teamId',o.current_team_id,'vehicleId',o.current_vehicle_id)
  order by o.route_date,o.created_at),'[]'::jsonb) from app_private.route_operations o
 where o.lifecycle_status not in ('cancelled','superseded','archived') and app_private.route_operation_driver_allowed(p_actor_id,o.route_operation_id,'route_operations.driver.read',null)
$$;

create or replace function api.driver_route_operation_manifest(p_actor_id uuid,p_route_operation_id uuid,p_device_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not app_private.route_operation_driver_allowed(p_actor_id,p_route_operation_id,'route_operations.driver.read',p_device_id) then raise exception 'permission denied' using errcode='42501'; end if;
 return app_private.route_operation_manifest_document(p_route_operation_id); end $$;

create or replace function api.driver_route_operation_freshness(p_actor_id uuid,p_route_operation_id uuid,p_local_manifest_revision integer,p_device_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$ declare o app_private.route_operations%rowtype; begin
 if not app_private.route_operation_driver_allowed(p_actor_id,p_route_operation_id,'route_operations.driver.read',p_device_id) then raise exception 'permission denied' using errcode='42501'; end if;
 select * into o from app_private.route_operations where route_operation_id=p_route_operation_id;
 return jsonb_build_object('routeOperationId',o.route_operation_id,'currentManifestRevision',o.manifest_revision,
  'localManifestRevision',p_local_manifest_revision,'stale',p_local_manifest_revision<>o.manifest_revision,
  'refreshRequired',p_local_manifest_revision<>o.manifest_revision or o.lifecycle_status in ('cancelled','superseded'),
  'lifecycleStatus',o.lifecycle_status,'cancelled',o.lifecycle_status='cancelled','superseded',o.lifecycle_status='superseded'); end $$;

create or replace function api.driver_route_operation_action(p_actor_id uuid,p_route_operation_id uuid,p_action jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o app_private.route_operations%rowtype; prior app_private.route_operation_actions%rowtype; fp text:=md5(p_action::text); aid uuid:=(p_action->>'actionId')::uuid; idem text:=p_action->>'idempotencyKey'; cid uuid:=(p_action->>'correlationId')::uuid; atype text:=p_action->>'actionType'; rev integer:=(p_action->>'assignmentRevision')::integer; device uuid:=nullif(p_action->>'deviceId','')::uuid; receipt jsonb; reject_code text; target text; conflict uuid;
begin
 if not app_private.route_operation_driver_allowed(p_actor_id,p_route_operation_id,'route_operations.driver.act',device) then raise exception 'permission denied' using errcode='42501'; end if;
 select * into prior from app_private.route_operation_actions where action_id=aid or (route_operation_id=p_route_operation_id and idempotency_key=idem) order by server_received_at limit 1;
 if prior.action_id is not null then
  if prior.request_fingerprint=fp then return prior.result_document||jsonb_build_object('outcome','duplicate'); end if;
  insert into app_private.route_operation_action_conflicts(route_operation_id,action_id,existing_action_id,incoming_fingerprint,reason_code) values(p_route_operation_id,aid,prior.action_id,fp,'idempotency_key_reused') returning conflict_id into conflict;
  return jsonb_build_object('actionId',aid,'serverReceivedAt',now(),'outcome','conflict','correlationId',cid,'conflictId',conflict,'rejectionCode','idempotency_key_reused');
 end if;
 select * into o from app_private.route_operations where route_operation_id=p_route_operation_id for update;
 if rev<>o.assignment_revision then reject_code:='stale_assignment_revision';
 elsif o.lifecycle_status='superseded' then reject_code:='operation_superseded';
 elsif o.lifecycle_status='cancelled' then reject_code:='operation_cancelled';
 elsif atype='accept' and o.lifecycle_status='available' then target:='accepted';
 elsif atype='start' and o.lifecycle_status='accepted' and o.route_date=current_date then target:='in_progress';
 elsif atype='suspend' and o.lifecycle_status='in_progress' then target:='suspended';
 elsif atype='resume' and o.lifecycle_status='suspended' then target:='in_progress';
 else reject_code:='invalid_lifecycle_transition'; end if;
 receipt:=jsonb_build_object('actionId',aid,'serverReceivedAt',now(),'outcome',case when reject_code is null then 'accepted' else 'rejected' end,'correlationId',cid)
  ||case when reject_code is null then '{}'::jsonb else jsonb_build_object('rejectionCode',reject_code) end;
 insert into app_private.route_operation_actions(action_id,route_operation_id,assignment_revision,device_id,actor_id,client_sequence,device_timestamp,idempotency_key,correlation_id,action_type,payload_version,payload,request_fingerprint,outcome,rejection_code,result_document)
 values(aid,p_route_operation_id,rev,device,p_actor_id,(p_action->>'clientSequence')::bigint,(p_action->>'deviceTimestamp')::timestamptz,idem,cid,atype,(p_action->>'payloadVersion')::integer,coalesce(p_action->'payload','{}'),fp,case when reject_code is null then 'accepted' else 'rejected' end,reject_code,receipt);
 if reject_code is not null then return receipt; end if;
 update app_private.route_operations set lifecycle_status=target,
  accepted_at=case when atype='accept' then now() else accepted_at end,accepted_by=case when atype='accept' then p_actor_id else accepted_by end,
  started_at=case when atype='start' then now() else started_at end,updated_at=now() where route_operation_id=p_route_operation_id returning * into o;
 perform app_private.emit_route_operation_fact(p_actor_id,o.route_operation_id,
  case atype when 'accept' then 'route_operations.assignment_accepted' when 'start' then 'route_operations.started' when 'suspend' then 'route_operations.suspended' else 'route_operations.resumed' end,
  case atype when 'accept' then 'RouteOperations.AssignmentAccepted' when 'start' then 'RouteOperations.RouteStarted' when 'suspend' then 'RouteOperations.RouteSuspended' else 'RouteOperations.RouteResumed' end,cid,
  jsonb_build_object('assignmentRevision',o.assignment_revision,'actionId',aid));
 return receipt; end $$;

create or replace function api.driver_route_operation_action_receipt(p_actor_id uuid,p_action_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare a app_private.route_operation_actions%rowtype; begin
 select * into a from app_private.route_operation_actions where action_id=p_action_id;
 if a.action_id is null then raise exception 'not found' using errcode='P0002'; end if;
 if not app_private.route_operation_driver_allowed(p_actor_id,a.route_operation_id,'route_operations.driver.read',a.device_id) then raise exception 'permission denied' using errcode='42501'; end if;
 return a.result_document; end $$;

revoke all on function app_private.require_route_operations_access(uuid,text,uuid),app_private.route_operation_driver_allowed(uuid,uuid,text,uuid),
 app_private.route_operation_manifest_document(uuid,integer),app_private.build_route_operation_manifest(uuid),app_private.route_operation_document(uuid),
 app_private.emit_route_operation_fact(uuid,uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function app_private.route_operation_driver_allowed(uuid,uuid,text,uuid) to service_role;
grant execute on function api.route_operations_handoff(uuid,uuid,uuid),api.route_operations_list(uuid,uuid,date),api.route_operation_get(uuid,uuid),
 api.route_operation_reassign(uuid,uuid,integer,uuid,uuid,uuid[],uuid,text,uuid),api.route_operation_supersede(uuid,uuid,uuid,text,uuid),
 api.route_operation_cancel(uuid,uuid,text,uuid),api.route_operation_assignment_history(uuid,uuid),api.driver_route_operations_current(uuid),
 api.driver_route_operation_manifest(uuid,uuid,uuid),api.driver_route_operation_freshness(uuid,uuid,integer,uuid),
 api.driver_route_operation_action(uuid,uuid,jsonb),api.driver_route_operation_action_receipt(uuid,uuid) to service_role;
