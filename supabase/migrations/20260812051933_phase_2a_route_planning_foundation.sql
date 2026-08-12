-- Phase 2A: deterministic route-planning domain foundation.

insert into app_private.permissions(permission_key,description) values
 ('routes.read','Read route plans within assigned regions'),
 ('routes.generate','Generate route plans from locked rosters'),
 ('routes.write','Edit unpublished route versions'),
 ('routes.validate','Validate route versions'),
 ('routes.publish','Publish route versions'),
 ('routes.replan','Create a new version from current planning inputs')
on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
select r.role_id,p.permission_key from app_private.roles r cross join app_private.permissions p
where r.role_key in ('director_admin','operations_manager') and p.permission_key like 'routes.%' on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
select r.role_id,p.permission_key from app_private.roles r cross join app_private.permissions p
where r.role_key='office_admin' and p.permission_key in ('routes.read','routes.generate','routes.write','routes.validate','routes.publish') on conflict do nothing;

create table app_private.route_plans (
 route_plan_id uuid primary key default gen_random_uuid(), operational_day_id uuid not null unique references app_private.operational_days,
 service_region_id uuid not null references app_private.service_regions, lifecycle_status text not null default 'draft'
  check(lifecycle_status in ('draft','ready','published','superseded','cancelled','archived')),
 current_version_id uuid, current_published_version_id uuid, created_by uuid references auth.users on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index route_plans_region_idx on app_private.route_plans(service_region_id,updated_at desc);

create table app_private.route_versions (
 route_version_id uuid primary key default gen_random_uuid(), route_plan_id uuid not null references app_private.route_plans on delete cascade,
 version_number integer not null check(version_number>0), source_version_id uuid references app_private.route_versions,
 version_status text not null default 'draft' check(version_status in ('draft','ready','published','superseded','cancelled','archived')),
 generation_method text not null default 'deterministic_baseline' check(generation_method='deterministic_baseline'),
 operational_day_updated_at timestamptz not null, roster_signature text not null, constraint_snapshot jsonb not null,
 planning_metrics jsonb not null default '{}', is_stale boolean not null default false, stale_reason text,
 change_reason text, created_by uuid references auth.users on delete set null, created_at timestamptz not null default now(),
 ready_at timestamptz, published_at timestamptz, published_by uuid references auth.users on delete set null, updated_at timestamptz not null default now(),
 unique(route_plan_id,version_number)
);
alter table app_private.route_plans add constraint route_plan_current_version_fk foreign key(current_version_id) references app_private.route_versions;
alter table app_private.route_plans add constraint route_plan_published_version_fk foreign key(current_published_version_id) references app_private.route_versions;
create index route_versions_plan_idx on app_private.route_versions(route_plan_id,version_number desc);

create table app_private.planned_routes (
 planned_route_id uuid primary key default gen_random_uuid(), route_version_id uuid not null references app_private.route_versions on delete cascade,
 daily_roster_entry_id uuid not null references app_private.daily_roster_entries, roster_entry_version integer not null,
 route_sequence integer not null, team_id uuid not null references app_private.teams, vehicle_id uuid not null references app_private.vehicles,
 staff_snapshot jsonb not null, start_depot_id uuid not null references app_private.depots, end_depot_id uuid not null references app_private.depots,
 planned_start_at timestamptz not null, planned_end_at timestamptz not null, usable_window_minutes integer not null check(usable_window_minutes>0),
 vehicle_capacity_units integer not null check(vehicle_capacity_units>0), planned_capacity_units integer not null default 0,
 planned_duration_minutes integer not null default 0, planned_distance_metres numeric(14,2) not null default 0,
 constraint_flags jsonb not null default '[]', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(route_version_id,team_id), unique(route_version_id,route_sequence)
);
create index planned_routes_version_idx on app_private.planned_routes(route_version_id,route_sequence);

create table app_private.planned_route_stops (
 planned_route_stop_id uuid primary key default gen_random_uuid(), route_version_id uuid not null references app_private.route_versions on delete cascade,
 planned_route_id uuid not null references app_private.planned_routes on delete cascade, sequence_number integer not null check(sequence_number>0),
 client_service_id uuid not null references app_private.client_services, service_configuration_id uuid not null references app_private.service_configurations,
 service_address_id uuid not null references app_private.service_addresses, territory_id uuid references app_private.territories,
 drum_units integer not null check(drum_units>0), latitude numeric(9,6) not null, longitude numeric(9,6) not null,
 address_snapshot jsonb not null, service_flags jsonb not null default '{}', planned_duration_minutes integer not null check(planned_duration_minutes>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(route_version_id,client_service_id), unique(planned_route_id,sequence_number)
);
create index planned_stops_route_idx on app_private.planned_route_stops(planned_route_id,sequence_number);
create index planned_stops_service_idx on app_private.planned_route_stops(client_service_id);

create table app_private.unassigned_route_services (
 unassigned_route_service_id uuid primary key default gen_random_uuid(), route_version_id uuid not null references app_private.route_versions on delete cascade,
 client_service_id uuid not null references app_private.client_services, service_configuration_id uuid references app_private.service_configurations,
 service_address_id uuid not null references app_private.service_addresses, reason_code text not null check(reason_code in
 ('missing_coordinates','missing_territory','no_eligible_team','capacity_exceeded','working_window_exceeded','invalid_service_configuration','unsupported_cadence','roster_assignment_unavailable')),
 constraint_detail jsonb not null default '{}', eligible_team_ids jsonb not null default '[]', remediation text not null,
 service_snapshot jsonb not null, created_at timestamptz not null default now(), unique(route_version_id,client_service_id)
);
create index unassigned_services_version_idx on app_private.unassigned_route_services(route_version_id,reason_code);

alter table app_private.route_plans enable row level security;
alter table app_private.route_versions enable row level security;
alter table app_private.planned_routes enable row level security;
alter table app_private.planned_route_stops enable row level security;
alter table app_private.unassigned_route_services enable row level security;
revoke all on app_private.route_plans,app_private.route_versions,app_private.planned_routes,app_private.planned_route_stops,app_private.unassigned_route_services from public,anon,authenticated;
grant select,insert,update,delete on app_private.route_plans,app_private.route_versions,app_private.planned_routes,app_private.planned_route_stops,app_private.unassigned_route_services to service_role;

create or replace function app_private.require_routes_access(p_actor_id uuid,p_permission text,p_region_id uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not app_private.user_has_region_permission(p_actor_id,p_permission,p_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
end $$;

create or replace function app_private.route_roster_signature(p_day_id uuid)
returns text language sql stable set search_path='' as $$
 select md5(coalesce(string_agg(e.daily_roster_entry_id::text||':'||e.version::text||':'||coalesce(e.assigned_vehicle_id::text,'')||':'||coalesce(e.assigned_depot_id::text,''),',' order by e.daily_roster_entry_id),''))
 from app_private.daily_roster_entries e where e.operational_day_id=p_day_id and e.entry_status<>'cancelled'
$$;

create or replace function app_private.refresh_route_staleness(p_version_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare stale boolean; begin
 select v.version_status in ('draft','ready') and (v.roster_signature<>app_private.route_roster_signature(p.operational_day_id) or v.operational_day_updated_at<>d.updated_at)
 into stale from app_private.route_versions v join app_private.route_plans p on p.route_plan_id=v.route_plan_id join app_private.operational_days d on d.operational_day_id=p.operational_day_id where v.route_version_id=p_version_id;
 update app_private.route_versions set is_stale=stale,stale_reason=case when stale then 'locked_roster_changed' end where route_version_id=p_version_id and version_status in ('draft','ready');
 return coalesce(stale,false); end $$;

create or replace function app_private.route_version_document(p_version_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(v)||jsonb_build_object('plan',to_jsonb(p),'operationalDay',to_jsonb(d),
  'routes',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('teamName',t.name,'vehicleName',ve.display_name,'stops',coalesce((select jsonb_agg(to_jsonb(s) order by s.sequence_number) from app_private.planned_route_stops s where s.planned_route_id=r.planned_route_id),'[]'::jsonb)) order by r.route_sequence) from app_private.planned_routes r join app_private.teams t on t.team_id=r.team_id join app_private.vehicles ve on ve.vehicle_id=r.vehicle_id where r.route_version_id=v.route_version_id),'[]'::jsonb),
  'unassignedServices',coalesce((select jsonb_agg(to_jsonb(u) order by u.reason_code,u.client_service_id) from app_private.unassigned_route_services u where u.route_version_id=v.route_version_id),'[]'::jsonb))
 from app_private.route_versions v join app_private.route_plans p on p.route_plan_id=v.route_plan_id join app_private.operational_days d on d.operational_day_id=p.operational_day_id where v.route_version_id=p_version_id
$$;

create or replace function api.route_plan_get(p_actor_id uuid,p_route_plan_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p app_private.route_plans%rowtype; begin select * into p from app_private.route_plans where route_plan_id=p_route_plan_id;
 if p.route_plan_id is null then raise exception 'not found' using errcode='P0002'; end if; perform app_private.require_routes_access(p_actor_id,'routes.read',p.service_region_id);
 perform app_private.refresh_route_staleness(p.current_version_id); return app_private.route_version_document(p.current_version_id); end $$;

create or replace function api.route_plan_find(p_actor_id uuid,p_service_region_id uuid,p_service_date date)
returns jsonb language plpgsql security definer set search_path='' as $$ declare id uuid; begin
 perform app_private.require_routes_access(p_actor_id,'routes.read',p_service_region_id); select p.route_plan_id into id from app_private.route_plans p join app_private.operational_days d on d.operational_day_id=p.operational_day_id where p.service_region_id=p_service_region_id and d.service_date=p_service_date;
 if id is null then return null; end if; return api.route_plan_get(p_actor_id,id); end $$;

create or replace function api.route_version_get(p_actor_id uuid,p_route_version_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare region_id uuid; begin
 select p.service_region_id into region_id from app_private.route_versions v join app_private.route_plans p on p.route_plan_id=v.route_plan_id where v.route_version_id=p_route_version_id;
 if region_id is null then raise exception 'not found' using errcode='P0002'; end if; perform app_private.require_routes_access(p_actor_id,'routes.read',region_id); perform app_private.refresh_route_staleness(p_route_version_id); return app_private.route_version_document(p_route_version_id); end $$;

create or replace function api.route_generate(p_actor_id uuid,p_operational_day_id uuid,p_correlation_id uuid,p_force_new boolean default false,p_source_version_id uuid default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d app_private.operational_days%rowtype; plan app_private.route_plans%rowtype; ver app_private.route_versions%rowtype; e record; svc record; target uuid; seq integer; capacity integer; max_minutes integer; unavailable_minutes integer; start_at timestamptz; sig text; version_no integer; eligible uuid[];
begin
 select * into d from app_private.operational_days where operational_day_id=p_operational_day_id for update;
 if d.operational_day_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.require_routes_access(p_actor_id,case when p_force_new then 'routes.replan' else 'routes.generate' end,d.service_region_id);
 if d.lifecycle_status<>'locked' then raise exception 'locked_roster_required' using errcode='55000'; end if;
 sig:=app_private.route_roster_signature(d.operational_day_id);
 select * into plan from app_private.route_plans where operational_day_id=d.operational_day_id for update;
 if plan.route_plan_id is null then insert into app_private.route_plans(operational_day_id,service_region_id,created_by) values(d.operational_day_id,d.service_region_id,p_actor_id) returning * into plan; end if;
 if not p_force_new then select * into ver from app_private.route_versions where route_plan_id=plan.route_plan_id and version_status='draft' and roster_signature=sig order by version_number desc limit 1; if ver.route_version_id is not null then return app_private.route_version_document(ver.route_version_id); end if; end if;
 select coalesce(max(version_number),0)+1 into version_no from app_private.route_versions where route_plan_id=plan.route_plan_id;
 insert into app_private.route_versions(route_plan_id,version_number,source_version_id,operational_day_updated_at,roster_signature,constraint_snapshot,change_reason,created_by)
 values(plan.route_plan_id,version_no,p_source_version_id,d.updated_at,sig,jsonb_build_object('stopDurationMinutes',10,'fallbackTravelMinutes',5,'depotAllowanceMinutes',30,'capacityUnit','drum','strategy','territory-geographic-sweep'),p_reason,p_actor_id) returning * into ver;
 for e in select re.*,v.estimated_drum_capacity,v.after_hours_grace_minutes,t.working_hours,d.service_date,d.timezone from app_private.daily_roster_entries re join app_private.vehicles v on v.vehicle_id=re.assigned_vehicle_id join app_private.teams t on t.team_id=re.team_id where re.operational_day_id=d.operational_day_id and re.entry_status='planned' and re.assigned_depot_id is not null order by t.team_code loop
  capacity:=e.estimated_drum_capacity; start_at:=(e.service_date::timestamp+time '07:00') at time zone e.timezone; max_minutes:=coalesce(nullif(e.working_hours->>'maxMinutes','')::integer,480)+e.after_hours_grace_minutes;
  select coalesce(sum(extract(epoch from (least(w.ends_at,start_at+make_interval(mins=>max_minutes))-greatest(w.starts_at,start_at)))/60),0)::integer into unavailable_minutes from app_private.staff_availability_windows w join app_private.daily_roster_staff_assignments a on a.staff_id=w.staff_id where a.daily_roster_entry_id=e.daily_roster_entry_id and w.availability_status in ('unavailable','limited') and w.starts_at<start_at+make_interval(mins=>max_minutes) and w.ends_at>start_at;
  select unavailable_minutes+coalesce(sum(extract(epoch from (least(w.ends_at,start_at+make_interval(mins=>max_minutes))-greatest(w.starts_at,start_at)))/60),0)::integer into unavailable_minutes from app_private.vehicle_availability_windows w where w.vehicle_id=e.assigned_vehicle_id and w.starts_at<start_at+make_interval(mins=>max_minutes) and w.ends_at>start_at;
  select greatest(start_at,coalesce(max(w.ends_at),start_at)) into start_at from app_private.staff_availability_windows w join app_private.daily_roster_staff_assignments a on a.staff_id=w.staff_id where a.daily_roster_entry_id=e.daily_roster_entry_id and w.starts_at<=start_at and w.ends_at>start_at;
  max_minutes:=greatest(1,max_minutes-unavailable_minutes);
  insert into app_private.planned_routes(route_version_id,daily_roster_entry_id,roster_entry_version,route_sequence,team_id,vehicle_id,staff_snapshot,start_depot_id,end_depot_id,planned_start_at,planned_end_at,usable_window_minutes,vehicle_capacity_units)
  values(ver.route_version_id,e.daily_roster_entry_id,e.version,(select count(*)+1 from app_private.planned_routes where route_version_id=ver.route_version_id),e.team_id,e.assigned_vehicle_id,coalesce((select jsonb_agg(jsonb_build_object('staffId',a.staff_id,'role',a.assignment_role) order by a.staff_id) from app_private.daily_roster_staff_assignments a where a.daily_roster_entry_id=e.daily_roster_entry_id),'[]'),e.assigned_depot_id,e.assigned_depot_id,start_at,start_at+make_interval(mins=>max_minutes),max_minutes,capacity) returning planned_route_id into target;
 end loop;
 for svc in select cs.client_service_id,cs.service_address_id,cs.cadence_code,sc.service_configuration_id,sc.territory_id,sc.default_team_id,sc.configured_drum_count,sa.latitude,sa.longitude,sa.address_line_1,sa.address_line_2,sa.suburb,sa.city,sa.postal_code,sa.dangerous_animal,sa.access_notes
  from app_private.client_services cs join app_private.clients c on c.client_id=cs.client_id join app_private.service_configurations sc on sc.client_service_id=cs.client_service_id join app_private.service_addresses sa on sa.service_address_id=cs.service_address_id
  where sc.service_region_id=d.service_region_id and sc.effective_from<=d.service_date and (sc.effective_to is null or sc.effective_to>=d.service_date) and sc.configured_collection_day=extract(isodow from d.service_date) and cs.lifecycle_status='active' and c.lifecycle_status='active' order by sc.territory_id,sa.longitude,sa.latitude,cs.client_service_id loop
  eligible:=array(select distinct pr.team_id from app_private.planned_routes pr where pr.route_version_id=ver.route_version_id and (pr.team_id=svc.default_team_id or exists(select 1 from app_private.territory_eligible_teams et where et.territory_id=svc.territory_id and et.team_id=pr.team_id)) order by pr.team_id);
  if svc.cadence_code<>'weekly' then insert into app_private.unassigned_route_services(route_version_id,client_service_id,service_configuration_id,service_address_id,reason_code,remediation,service_snapshot) values(ver.route_version_id,svc.client_service_id,svc.service_configuration_id,svc.service_address_id,'unsupported_cadence','Configure an approved cadence anchor before planning.',to_jsonb(svc)); continue; end if;
  if svc.latitude is null then insert into app_private.unassigned_route_services(route_version_id,client_service_id,service_configuration_id,service_address_id,reason_code,remediation,service_snapshot) values(ver.route_version_id,svc.client_service_id,svc.service_configuration_id,svc.service_address_id,'missing_coordinates','Geocode and validate the service address.',to_jsonb(svc)); continue; end if;
  if svc.territory_id is null then insert into app_private.unassigned_route_services(route_version_id,client_service_id,service_configuration_id,service_address_id,reason_code,remediation,service_snapshot) values(ver.route_version_id,svc.client_service_id,svc.service_configuration_id,svc.service_address_id,'missing_territory','Assign a territory to the effective service configuration.',to_jsonb(svc)); continue; end if;
  if coalesce(array_length(eligible,1),0)=0 then insert into app_private.unassigned_route_services(route_version_id,client_service_id,service_configuration_id,service_address_id,reason_code,eligible_team_ids,remediation,service_snapshot) values(ver.route_version_id,svc.client_service_id,svc.service_configuration_id,svc.service_address_id,'no_eligible_team',to_jsonb(eligible),'Assign an eligible locked roster team.',to_jsonb(svc)); continue; end if;
  select pr.planned_route_id into target from app_private.planned_routes pr where pr.route_version_id=ver.route_version_id and pr.team_id=any(eligible) and pr.planned_capacity_units+svc.configured_drum_count<=pr.vehicle_capacity_units and pr.planned_duration_minutes+15<=pr.usable_window_minutes order by pr.planned_capacity_units,pr.route_sequence limit 1;
  if target is null then insert into app_private.unassigned_route_services(route_version_id,client_service_id,service_configuration_id,service_address_id,reason_code,eligible_team_ids,remediation,service_snapshot) values(ver.route_version_id,svc.client_service_id,svc.service_configuration_id,svc.service_address_id,case when exists(select 1 from app_private.planned_routes pr where pr.route_version_id=ver.route_version_id and pr.team_id=any(eligible) and pr.planned_capacity_units+svc.configured_drum_count<=pr.vehicle_capacity_units) then 'working_window_exceeded' else 'capacity_exceeded' end,to_jsonb(eligible),'Move the service manually or change an owning capacity/window input.',to_jsonb(svc)); continue; end if;
  select coalesce(max(sequence_number),0)+1 into seq from app_private.planned_route_stops where planned_route_id=target;
  insert into app_private.planned_route_stops(route_version_id,planned_route_id,sequence_number,client_service_id,service_configuration_id,service_address_id,territory_id,drum_units,latitude,longitude,address_snapshot,service_flags,planned_duration_minutes)
  values(ver.route_version_id,target,seq,svc.client_service_id,svc.service_configuration_id,svc.service_address_id,svc.territory_id,svc.configured_drum_count,svc.latitude,svc.longitude,jsonb_build_object('line1',svc.address_line_1,'line2',svc.address_line_2,'suburb',svc.suburb,'city',svc.city,'postalCode',svc.postal_code),jsonb_build_object('dangerousAnimal',svc.dangerous_animal,'accessNotes',svc.access_notes),10);
  update app_private.planned_routes set planned_capacity_units=planned_capacity_units+svc.configured_drum_count,planned_duration_minutes=planned_duration_minutes+15,updated_at=now() where planned_route_id=target; target:=null;
 end loop;
 update app_private.route_versions set planning_metrics=jsonb_build_object('routeCount',(select count(*) from app_private.planned_routes where route_version_id=ver.route_version_id),'assignedStopCount',(select count(*) from app_private.planned_route_stops where route_version_id=ver.route_version_id),'unassignedCount',(select count(*) from app_private.unassigned_route_services where route_version_id=ver.route_version_id)),updated_at=now() where route_version_id=ver.route_version_id;
 update app_private.route_plans set current_version_id=ver.route_version_id,lifecycle_status='draft',updated_at=now() where route_plan_id=plan.route_plan_id;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values(case when p_force_new then 'routes.replanned' else 'routes.generated' end,p_actor_id,'routes','route-version',ver.route_version_id,p_correlation_id,jsonb_build_object('versionNumber',version_no));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('routes',case when p_force_new then 'Routes.RouteReplanned' else 'Routes.RouteGenerated' end,1,'route-plan',plan.route_plan_id,jsonb_build_object('routePlanId',plan.route_plan_id,'routeVersionId',ver.route_version_id,'versionNumber',version_no,'operationalDayId',d.operational_day_id),p_correlation_id,'user',p_actor_id::text,now());
 return app_private.route_version_document(ver.route_version_id); end $$;

create or replace function api.route_validate(p_actor_id uuid,p_route_version_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare region_id uuid; stale boolean; issues jsonb; begin
 select p.service_region_id into region_id from app_private.route_versions v join app_private.route_plans p on p.route_plan_id=v.route_plan_id where v.route_version_id=p_route_version_id;
 perform app_private.require_routes_access(p_actor_id,'routes.validate',region_id); stale:=app_private.refresh_route_staleness(p_route_version_id);
 select coalesce(jsonb_agg(x),'[]') into issues from (select jsonb_build_object('code','stale_roster','blocking',true) x where stale union all select jsonb_build_object('code','unassigned_services','blocking',false) where exists(select 1 from app_private.unassigned_route_services where route_version_id=p_route_version_id) union all select jsonb_build_object('code','capacity_exceeded','blocking',true) where exists(select 1 from app_private.planned_routes where route_version_id=p_route_version_id and planned_capacity_units>vehicle_capacity_units) union all select jsonb_build_object('code','working_window_exceeded','blocking',true) where exists(select 1 from app_private.planned_routes where route_version_id=p_route_version_id and planned_duration_minutes>usable_window_minutes)) q;
 return jsonb_build_object('valid',not exists(select 1 from jsonb_array_elements(issues) i where (i->>'blocking')::boolean),'issues',issues); end $$;

create or replace function api.route_transition(p_actor_id uuid,p_route_version_id uuid,p_target text,p_expected_updated_at timestamptz,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare v app_private.route_versions%rowtype; p app_private.route_plans%rowtype; validation jsonb; begin
 select * into v from app_private.route_versions where route_version_id=p_route_version_id for update; select * into p from app_private.route_plans where route_plan_id=v.route_plan_id for update;
 perform app_private.require_routes_access(p_actor_id,case when p_target='published' then 'routes.publish' else 'routes.write' end,p.service_region_id);
 if v.updated_at<>p_expected_updated_at then raise exception 'stale_update' using errcode='40001'; end if; if not ((v.version_status='draft' and p_target='ready') or (v.version_status='ready' and p_target in ('draft','published'))) then raise exception 'invalid_transition' using errcode='22023'; end if;
 validation:=api.route_validate(p_actor_id,p_route_version_id); if p_target in ('ready','published') and not (validation->>'valid')::boolean then raise exception 'route_not_valid' using errcode='22023'; end if;
 if p_target='published' then update app_private.route_versions set version_status='superseded',updated_at=now() where route_plan_id=p.route_plan_id and version_status='published'; end if;
 update app_private.route_versions set version_status=p_target,ready_at=case when p_target='ready' then now() else ready_at end,published_at=case when p_target='published' then now() else published_at end,published_by=case when p_target='published' then p_actor_id else published_by end,updated_at=now() where route_version_id=p_route_version_id returning * into v;
 update app_private.route_plans set lifecycle_status=p_target,current_version_id=p_route_version_id,current_published_version_id=case when p_target='published' then p_route_version_id else current_published_version_id end,updated_at=now() where route_plan_id=p.route_plan_id;
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('routes',case when p_target='published' then 'Routes.RoutePublished' else 'Routes.RouteReady' end,1,'route-plan',p.route_plan_id,jsonb_build_object('routePlanId',p.route_plan_id,'routeVersionId',p_route_version_id,'versionNumber',v.version_number),p_correlation_id,'user',p_actor_id::text,now()); return app_private.route_version_document(p_route_version_id); end $$;

create or replace function api.route_stop_move(p_actor_id uuid,p_stop_id uuid,p_target_route_id uuid,p_target_sequence integer,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare s app_private.planned_route_stops%rowtype; v app_private.route_versions%rowtype; p app_private.route_plans%rowtype; old_route uuid; new_team uuid; begin
 select * into s from app_private.planned_route_stops where planned_route_stop_id=p_stop_id for update; select * into v from app_private.route_versions where route_version_id=s.route_version_id for update; select * into p from app_private.route_plans where route_plan_id=v.route_plan_id;
 perform app_private.require_routes_access(p_actor_id,'routes.write',p.service_region_id); if v.version_status<>'draft' then raise exception 'published_version_immutable' using errcode='55000'; end if; if nullif(trim(p_reason),'') is null then raise exception 'reason_required' using errcode='22023'; end if;
 select team_id into new_team from app_private.planned_routes where planned_route_id=p_target_route_id and route_version_id=v.route_version_id; if new_team is null then raise exception 'invalid_target_route' using errcode='22023'; end if;
 if not exists(select 1 from app_private.service_configurations sc where sc.service_configuration_id=s.service_configuration_id and (sc.default_team_id=new_team or exists(select 1 from app_private.territory_eligible_teams et where et.territory_id=sc.territory_id and et.team_id=new_team))) then raise exception 'team_not_eligible' using errcode='22023'; end if;
 if exists(select 1 from app_private.planned_routes r where r.planned_route_id=p_target_route_id and r.planned_capacity_units+s.drum_units>r.vehicle_capacity_units) then raise exception 'capacity_exceeded' using errcode='22023'; end if;
 old_route:=s.planned_route_id; update app_private.planned_route_stops set sequence_number=sequence_number+1 where planned_route_id=p_target_route_id and sequence_number>=p_target_sequence;
 update app_private.planned_route_stops set planned_route_id=p_target_route_id,sequence_number=p_target_sequence,updated_at=now() where planned_route_stop_id=p_stop_id;
 with numbered as (select planned_route_stop_id,row_number() over(partition by planned_route_id order by sequence_number,planned_route_stop_id) n from app_private.planned_route_stops where planned_route_id in(old_route,p_target_route_id)) update app_private.planned_route_stops s2 set sequence_number=n.n from numbered n where n.planned_route_stop_id=s2.planned_route_stop_id;
 update app_private.planned_routes r set planned_capacity_units=(select coalesce(sum(drum_units),0) from app_private.planned_route_stops where planned_route_id=r.planned_route_id),planned_duration_minutes=(select count(*)*15 from app_private.planned_route_stops where planned_route_id=r.planned_route_id),updated_at=now() where r.planned_route_id in(old_route,p_target_route_id);
 update app_private.route_versions set updated_at=now() where route_version_id=v.route_version_id; insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('routes.stop_moved',p_actor_id,'routes','planned-route-stop',p_stop_id,p_correlation_id,jsonb_build_object('fromRouteId',old_route,'toRouteId',p_target_route_id,'reason',p_reason));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('routes','Routes.RouteAssignmentChanged',1,'route-plan',p.route_plan_id,jsonb_build_object('routePlanId',p.route_plan_id,'routeVersionId',v.route_version_id,'stopId',p_stop_id),p_correlation_id,'user',p_actor_id::text,now()); return app_private.route_version_document(v.route_version_id); end $$;

create or replace function api.route_stop_unassign(p_actor_id uuid,p_stop_id uuid,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare s app_private.planned_route_stops%rowtype; v app_private.route_versions%rowtype; p app_private.route_plans%rowtype; begin
 select * into s from app_private.planned_route_stops where planned_route_stop_id=p_stop_id for update; select * into v from app_private.route_versions where route_version_id=s.route_version_id for update; select * into p from app_private.route_plans where route_plan_id=v.route_plan_id; perform app_private.require_routes_access(p_actor_id,'routes.write',p.service_region_id);
 if v.version_status<>'draft' then raise exception 'published_version_immutable' using errcode='55000'; end if; if nullif(trim(p_reason),'') is null then raise exception 'reason_required' using errcode='22023'; end if;
 insert into app_private.unassigned_route_services(route_version_id,client_service_id,service_configuration_id,service_address_id,reason_code,remediation,service_snapshot) values(v.route_version_id,s.client_service_id,s.service_configuration_id,s.service_address_id,'roster_assignment_unavailable','Assign to an eligible route.',jsonb_build_object('manualReason',p_reason,'drumUnits',s.drum_units)); delete from app_private.planned_route_stops where planned_route_stop_id=p_stop_id;
 with n as(select planned_route_stop_id,row_number() over(order by sequence_number) seq from app_private.planned_route_stops where planned_route_id=s.planned_route_id) update app_private.planned_route_stops x set sequence_number=n.seq from n where n.planned_route_stop_id=x.planned_route_stop_id;
 update app_private.planned_routes r set planned_capacity_units=(select coalesce(sum(drum_units),0) from app_private.planned_route_stops where planned_route_id=r.planned_route_id),planned_duration_minutes=(select count(*)*15 from app_private.planned_route_stops where planned_route_id=r.planned_route_id),updated_at=now() where planned_route_id=s.planned_route_id; update app_private.route_versions set updated_at=now() where route_version_id=v.route_version_id;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('routes.stop_unassigned',p_actor_id,'routes','planned-route-stop',p_stop_id,p_correlation_id,jsonb_build_object('reason',p_reason)); return app_private.route_version_document(v.route_version_id); end $$;

create or replace function api.route_service_assign(p_actor_id uuid,p_unassigned_id uuid,p_target_route_id uuid,p_target_sequence integer,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare u app_private.unassigned_route_services%rowtype; r app_private.planned_routes%rowtype; v app_private.route_versions%rowtype; p app_private.route_plans%rowtype; sc app_private.service_configurations%rowtype; a app_private.service_addresses%rowtype; begin
 select * into u from app_private.unassigned_route_services where unassigned_route_service_id=p_unassigned_id for update; select * into r from app_private.planned_routes where planned_route_id=p_target_route_id and route_version_id=u.route_version_id for update; select * into v from app_private.route_versions where route_version_id=u.route_version_id for update; select * into p from app_private.route_plans where route_plan_id=v.route_plan_id; select * into sc from app_private.service_configurations where service_configuration_id=u.service_configuration_id; select * into a from app_private.service_addresses where service_address_id=u.service_address_id; perform app_private.require_routes_access(p_actor_id,'routes.write',p.service_region_id);
 if v.version_status<>'draft' then raise exception 'published_version_immutable' using errcode='55000'; end if; if nullif(trim(p_reason),'') is null or r.planned_route_id is null or a.latitude is null then raise exception 'service_not_assignable' using errcode='22023'; end if; if not(sc.default_team_id=r.team_id or exists(select 1 from app_private.territory_eligible_teams e where e.territory_id=sc.territory_id and e.team_id=r.team_id)) then raise exception 'team_not_eligible' using errcode='22023'; end if; if r.planned_capacity_units+sc.configured_drum_count>r.vehicle_capacity_units or r.planned_duration_minutes+15>r.usable_window_minutes then raise exception 'route_constraint_exceeded' using errcode='22023'; end if;
 update app_private.planned_route_stops set sequence_number=sequence_number+1 where planned_route_id=p_target_route_id and sequence_number>=p_target_sequence; insert into app_private.planned_route_stops(route_version_id,planned_route_id,sequence_number,client_service_id,service_configuration_id,service_address_id,territory_id,drum_units,latitude,longitude,address_snapshot,service_flags,planned_duration_minutes) values(v.route_version_id,p_target_route_id,p_target_sequence,u.client_service_id,sc.service_configuration_id,u.service_address_id,sc.territory_id,sc.configured_drum_count,a.latitude,a.longitude,jsonb_build_object('line1',a.address_line_1,'suburb',a.suburb,'city',a.city),jsonb_build_object('manualReason',p_reason),10); delete from app_private.unassigned_route_services where unassigned_route_service_id=p_unassigned_id; update app_private.planned_routes set planned_capacity_units=planned_capacity_units+sc.configured_drum_count,planned_duration_minutes=planned_duration_minutes+15,updated_at=now() where planned_route_id=p_target_route_id; update app_private.route_versions set updated_at=now() where route_version_id=v.route_version_id; return app_private.route_version_document(v.route_version_id); end $$;

create or replace function api.route_start_time_update(p_actor_id uuid,p_planned_route_id uuid,p_planned_start_at timestamptz,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare r app_private.planned_routes%rowtype; v app_private.route_versions%rowtype; p app_private.route_plans%rowtype; begin
 select * into r from app_private.planned_routes where planned_route_id=p_planned_route_id for update; select * into v from app_private.route_versions where route_version_id=r.route_version_id for update; select * into p from app_private.route_plans where route_plan_id=v.route_plan_id; perform app_private.require_routes_access(p_actor_id,'routes.write',p.service_region_id); if v.version_status<>'draft' then raise exception 'published_version_immutable' using errcode='55000'; end if; if nullif(trim(p_reason),'') is null then raise exception 'reason_required' using errcode='22023'; end if;
 update app_private.planned_routes set planned_start_at=p_planned_start_at,planned_end_at=p_planned_start_at+make_interval(mins=>usable_window_minutes),updated_at=now() where planned_route_id=p_planned_route_id; update app_private.route_versions set updated_at=now() where route_version_id=v.route_version_id; insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('routes.start_time_changed',p_actor_id,'routes','planned-route',p_planned_route_id,p_correlation_id,jsonb_build_object('plannedStartAt',p_planned_start_at,'reason',p_reason)); return app_private.route_version_document(v.route_version_id); end $$;

revoke all on function api.route_plan_get(uuid,uuid),api.route_plan_find(uuid,uuid,date),api.route_version_get(uuid,uuid),api.route_generate(uuid,uuid,uuid,boolean,uuid,text),api.route_validate(uuid,uuid),api.route_transition(uuid,uuid,text,timestamptz,uuid),api.route_stop_move(uuid,uuid,uuid,integer,text,uuid),api.route_stop_unassign(uuid,uuid,text,uuid),api.route_service_assign(uuid,uuid,uuid,integer,text,uuid),api.route_start_time_update(uuid,uuid,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function api.route_plan_get(uuid,uuid),api.route_plan_find(uuid,uuid,date),api.route_version_get(uuid,uuid),api.route_generate(uuid,uuid,uuid,boolean,uuid,text),api.route_validate(uuid,uuid),api.route_transition(uuid,uuid,text,timestamptz,uuid),api.route_stop_move(uuid,uuid,uuid,integer,text,uuid),api.route_stop_unassign(uuid,uuid,text,uuid),api.route_service_assign(uuid,uuid,uuid,integer,text,uuid),api.route_start_time_update(uuid,uuid,timestamptz,text,uuid) to service_role;
