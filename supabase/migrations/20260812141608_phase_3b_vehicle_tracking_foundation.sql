-- Phase 3B: provider-neutral vehicle tracking foundation.

alter table app_private.vehicle_tracking_devices
  alter column vehicle_id drop not null,
  add column service_region_id uuid references app_private.service_regions,
  add column device_name text,
  add column device_type text not null default 'driver_pwa' check (device_type in ('driver_pwa','dedicated_gps','external_provider')),
  add column lifecycle_status text not null default 'registered' check (lifecycle_status in ('registered','active','suspended','revoked','retired')),
  add column registered_at timestamptz not null default now(),
  add column activated_at timestamptz,
  add column suspended_at timestamptz,
  add column revoked_at timestamptz,
  add column last_seen_at timestamptz,
  add column last_successful_position_at timestamptz,
  add column owner_user_id uuid references auth.users on delete set null,
  add column credential_reference text,
  add column compatibility_metadata jsonb not null default '{}' check(jsonb_typeof(compatibility_metadata)='object');

update app_private.vehicle_tracking_devices d set service_region_id=v.service_region_id,
 device_name=coalesce(d.device_reference,'Tracking device'), lifecycle_status=case when retired_at is null then 'active' else 'retired' end,
 activated_at=valid_from from app_private.vehicles v where v.vehicle_id=d.vehicle_id;
alter table app_private.vehicle_tracking_devices alter column service_region_id set not null;
create unique index vehicle_tracking_one_owner on app_private.vehicle_tracking_devices(owner_user_id) where owner_user_id is not null and lifecycle_status in ('registered','active','suspended');

create table app_private.vehicle_tracking_assignments (
 vehicle_tracking_assignment_id uuid primary key default gen_random_uuid(),
 vehicle_tracking_device_id uuid not null references app_private.vehicle_tracking_devices,
 vehicle_id uuid not null references app_private.vehicles,
 service_region_id uuid not null references app_private.service_regions,
 effective_from timestamptz not null default now(), effective_to timestamptz,
 assigned_by uuid references auth.users on delete set null, reason text not null,
 created_at timestamptz not null default now(),
 check(effective_to is null or effective_to>effective_from)
);
create unique index vehicle_tracking_assignment_device_active on app_private.vehicle_tracking_assignments(vehicle_tracking_device_id) where effective_to is null;
create unique index vehicle_tracking_assignment_vehicle_active on app_private.vehicle_tracking_assignments(vehicle_id) where effective_to is null;
insert into app_private.vehicle_tracking_assignments(vehicle_tracking_device_id,vehicle_id,service_region_id,effective_from,effective_to,reason)
 select d.vehicle_tracking_device_id,d.vehicle_id,d.service_region_id,d.valid_from,d.retired_at,'Migrated existing device association'
 from app_private.vehicle_tracking_devices d where d.vehicle_id is not null;

create table app_private.vehicle_location_observations (
 observation_id uuid primary key, vehicle_tracking_device_id uuid not null references app_private.vehicle_tracking_devices,
 vehicle_id uuid not null references app_private.vehicles, service_region_id uuid not null references app_private.service_regions,
 route_operation_id uuid references app_private.route_operations, operational_day_id uuid references app_private.operational_days,
 team_id uuid references app_private.teams, recorded_at timestamptz not null, server_received_at timestamptz not null default now(),
 latitude numeric(9,6) not null check(latitude between -90 and 90), longitude numeric(9,6) not null check(longitude between -180 and 180),
 position extensions.geography(Point,4326) not null, accuracy_metres numeric(9,2) not null check(accuracy_metres>=0 and accuracy_metres<=10000),
 altitude_metres numeric(10,2), heading_degrees numeric(6,2) check(heading_degrees is null or heading_degrees>=0 and heading_degrees<360),
 speed_metres_per_second numeric(9,2) check(speed_metres_per_second is null or speed_metres_per_second>=0 and speed_metres_per_second<=150),
 client_sequence bigint not null, idempotency_key text not null, correlation_id uuid not null,
 source_provider text not null, ingestion_status text not null check(ingestion_status in ('accepted','poor_quality')),
 quality_signals jsonb not null default '{}' check(jsonb_typeof(quality_signals)='object'),
 unique(vehicle_tracking_device_id,idempotency_key)
);
create index vehicle_location_observations_device_time_idx on app_private.vehicle_location_observations(vehicle_tracking_device_id,recorded_at desc,server_received_at desc);
create index vehicle_location_observations_vehicle_time_idx on app_private.vehicle_location_observations(vehicle_id,recorded_at desc);
create index vehicle_location_observations_position_idx on app_private.vehicle_location_observations using gist(position);

create table app_private.vehicle_location_ingestions (
 observation_id uuid primary key, vehicle_tracking_device_id uuid not null references app_private.vehicle_tracking_devices,
 idempotency_key text not null, request_fingerprint text not null,
 outcome text not null check(outcome in ('accepted','rejected')), rejection_code text,
 receipt jsonb not null, server_received_at timestamptz not null default now(),
 unique(vehicle_tracking_device_id,idempotency_key)
);

create table app_private.current_vehicle_positions (
 vehicle_id uuid primary key references app_private.vehicles, vehicle_tracking_device_id uuid not null references app_private.vehicle_tracking_devices,
 observation_id uuid not null references app_private.vehicle_location_observations,
 service_region_id uuid not null references app_private.service_regions, route_operation_id uuid references app_private.route_operations,
 team_id uuid references app_private.teams, recorded_at timestamptz not null, server_received_at timestamptz not null,
 latitude numeric(9,6) not null, longitude numeric(9,6) not null, position extensions.geography(Point,4326) not null,
 accuracy_metres numeric(9,2) not null, heading_degrees numeric(6,2), speed_metres_per_second numeric(9,2), updated_at timestamptz not null default now()
);
create index current_vehicle_positions_region_idx on app_private.current_vehicle_positions(service_region_id);

insert into app_private.configuration_definitions(configuration_key,description,value_type,default_value) values
 ('vehicle-tracking.capture-interval-seconds','Foreground Driver location capture interval','number','45'),
 ('vehicle-tracking.max-batch-size','Maximum observations per ingestion batch','number','100'),
 ('vehicle-tracking.max-future-skew-seconds','Maximum accepted future device clock skew','number','300'),
 ('vehicle-tracking.max-observation-age-hours','Maximum accepted historical observation age','number','168'),
 ('vehicle-tracking.healthy-seconds','Healthy position age threshold','number','120'),
 ('vehicle-tracking.delayed-seconds','Delayed position age threshold','number','300'),
 ('vehicle-tracking.stale-seconds','Stale position age threshold','number','900'),
 ('vehicle-tracking.raw-retention-days','Raw GPS retention; production value requires approval','number','30'),
 ('vehicle-tracking.local-max-observations','Maximum queued Driver observations','number','1000')
on conflict(configuration_key) do nothing;

insert into app_private.permissions(permission_key,description) values
 ('vehicle_tracking.read','Read current vehicle tracking within assigned regions'),
 ('vehicle_tracking.manage_devices','Register and change tracking-device lifecycle'),
 ('vehicle_tracking.assign_devices','Assign tracking devices to regional vehicles'),
 ('vehicle_tracking.ingest','Ingest observations for an owned active device'),
 ('vehicle_tracking.health.read','Read regional tracking health') on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
 select r.role_id,p.permission_key from app_private.roles r cross join app_private.permissions p
 where r.role_key in ('director_admin','operations_manager','office_admin') and p.permission_key in ('vehicle_tracking.read','vehicle_tracking.health.read','vehicle_tracking.manage_devices','vehicle_tracking.assign_devices') on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
 select r.role_id,'vehicle_tracking.ingest' from app_private.roles r where r.role_key='driver_team' on conflict do nothing;

create or replace function app_private.require_vehicle_tracking_access(p_actor_id uuid,p_permission text,p_region_id uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not (app_private.user_has_global_permission(p_actor_id,p_permission) or app_private.user_has_region_permission(p_actor_id,p_permission,p_region_id)) then raise exception 'permission denied' using errcode='42501'; end if;
end $$;

create or replace function app_private.tracking_setting(p_key text,p_fallback numeric)
returns numeric language sql stable set search_path='' as $$
 select coalesce((select (configuration_value#>>'{}')::numeric from app_private.configuration_values where configuration_key=p_key and environment_name='local'),
 (select (default_value#>>'{}')::numeric from app_private.configuration_definitions where configuration_key=p_key),p_fallback)
$$;

create or replace function api.vehicle_tracking_device_list(p_actor_id uuid,p_region_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform app_private.require_vehicle_tracking_access(p_actor_id,'vehicle_tracking.read',p_region_id);
 return coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('vehicleDisplayName',v.display_name,'registrationReference',v.registration_reference) order by d.device_name)
 from app_private.vehicle_tracking_devices d left join app_private.vehicles v on v.vehicle_id=d.vehicle_id where d.service_region_id=p_region_id),'[]'); end $$;

create or replace function api.vehicle_tracking_device_register(p_actor_id uuid,p_input jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare d app_private.vehicle_tracking_devices%rowtype; region uuid:=(p_input->>'serviceRegionId')::uuid; begin
 perform app_private.require_vehicle_tracking_access(p_actor_id,'vehicle_tracking.manage_devices',region);
 insert into app_private.vehicle_tracking_devices(service_region_id,provider_key,device_reference,device_name,device_type,owner_user_id,credential_reference,compatibility_metadata)
 values(region,p_input->>'providerKey',p_input->>'deviceReference',p_input->>'deviceName',coalesce(p_input->>'deviceType','driver_pwa'),nullif(p_input->>'ownerUserId','')::uuid,nullif(p_input->>'credentialReference',''),coalesce(p_input->'metadata','{}')) returning * into d;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('vehicle_tracking.device_registered',p_actor_id,'vehicle-tracking','tracking-device',d.vehicle_tracking_device_id,p_correlation_id,jsonb_build_object('serviceRegionId',region,'deviceType',d.device_type));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('vehicle-tracking','VehicleTracking.DeviceRegistered',1,'tracking-device',d.vehicle_tracking_device_id,jsonb_build_object('deviceId',d.vehicle_tracking_device_id,'serviceRegionId',region),p_correlation_id,'user',p_actor_id::text,now());
 return to_jsonb(d); end $$;

create or replace function api.vehicle_tracking_device_lifecycle(p_actor_id uuid,p_device_id uuid,p_target text,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare d app_private.vehicle_tracking_devices%rowtype; begin
 select * into d from app_private.vehicle_tracking_devices where vehicle_tracking_device_id=p_device_id for update; if d.vehicle_tracking_device_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.require_vehicle_tracking_access(p_actor_id,'vehicle_tracking.manage_devices',d.service_region_id);
 if p_target not in ('active','suspended','revoked','retired') or nullif(trim(p_reason),'') is null then raise exception 'invalid_device_transition' using errcode='22023'; end if;
 if not ((d.lifecycle_status='registered' and p_target='active') or (d.lifecycle_status='active' and p_target in ('suspended','revoked','retired')) or (d.lifecycle_status='suspended' and p_target in ('active','revoked','retired'))) then raise exception 'invalid_device_transition' using errcode='22023'; end if;
 update app_private.vehicle_tracking_devices set lifecycle_status=p_target,activated_at=case when p_target='active' then coalesce(activated_at,now()) else activated_at end,suspended_at=case when p_target='suspended' then now() else suspended_at end,revoked_at=case when p_target='revoked' then now() else revoked_at end,retired_at=case when p_target='retired' then now() else retired_at end where vehicle_tracking_device_id=p_device_id returning * into d;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('vehicle_tracking.device_'||p_target,p_actor_id,'vehicle-tracking','tracking-device',p_device_id,p_correlation_id,jsonb_build_object('status',p_target,'reason',left(p_reason,200)));
 if p_target='revoked' then insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('vehicle-tracking','VehicleTracking.DeviceRevoked',1,'tracking-device',p_device_id,jsonb_build_object('deviceId',p_device_id,'serviceRegionId',d.service_region_id),p_correlation_id,'user',p_actor_id::text,now()); end if;
 return to_jsonb(d); end $$;

create or replace function api.vehicle_tracking_device_assign(p_actor_id uuid,p_device_id uuid,p_vehicle_id uuid,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare d app_private.vehicle_tracking_devices%rowtype; v app_private.vehicles%rowtype; a app_private.vehicle_tracking_assignments%rowtype; begin
 select * into d from app_private.vehicle_tracking_devices where vehicle_tracking_device_id=p_device_id for update; select * into v from app_private.vehicles where vehicle_id=p_vehicle_id;
 if d.vehicle_tracking_device_id is null or v.vehicle_id is null then raise exception 'not found' using errcode='P0002'; end if; if d.service_region_id<>v.service_region_id or nullif(trim(p_reason),'') is null then raise exception 'invalid_device_assignment' using errcode='22023'; end if;
 perform app_private.require_vehicle_tracking_access(p_actor_id,'vehicle_tracking.assign_devices',d.service_region_id);
 update app_private.vehicle_tracking_assignments set effective_to=now() where (vehicle_tracking_device_id=p_device_id or vehicle_id=p_vehicle_id) and effective_to is null;
 insert into app_private.vehicle_tracking_assignments(vehicle_tracking_device_id,vehicle_id,service_region_id,assigned_by,reason) values(p_device_id,p_vehicle_id,d.service_region_id,p_actor_id,p_reason) returning * into a;
 update app_private.vehicle_tracking_devices set vehicle_id=p_vehicle_id where vehicle_tracking_device_id=p_device_id;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('vehicle_tracking.device_assigned',p_actor_id,'vehicle-tracking','tracking-device',p_device_id,p_correlation_id,jsonb_build_object('vehicleId',p_vehicle_id,'assignmentId',a.vehicle_tracking_assignment_id));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('vehicle-tracking','VehicleTracking.DeviceAssigned',1,'tracking-device',p_device_id,jsonb_build_object('deviceId',p_device_id,'vehicleId',p_vehicle_id,'serviceRegionId',d.service_region_id),p_correlation_id,'user',p_actor_id::text,now()); return to_jsonb(a); end $$;

create or replace function api.vehicle_tracking_assignment_history(p_actor_id uuid,p_device_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare region uuid; begin select service_region_id into region from app_private.vehicle_tracking_devices where vehicle_tracking_device_id=p_device_id; perform app_private.require_vehicle_tracking_access(p_actor_id,'vehicle_tracking.read',region); return coalesce((select jsonb_agg(to_jsonb(a) order by effective_from desc) from app_private.vehicle_tracking_assignments a where vehicle_tracking_device_id=p_device_id),'[]'); end $$;

create or replace function api.vehicle_tracking_own_device(p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare d app_private.vehicle_tracking_devices%rowtype; begin
 select * into d from app_private.vehicle_tracking_devices where owner_user_id=p_actor_id and lifecycle_status in ('registered','active','suspended') order by registered_at desc limit 1;
 if d.vehicle_tracking_device_id is null then return null; end if; return jsonb_build_object('deviceId',d.vehicle_tracking_device_id,'deviceName',d.device_name,'status',d.lifecycle_status,'vehicleId',d.vehicle_id,'serviceRegionId',d.service_region_id); end $$;

create or replace function api.vehicle_tracking_ingest_batch(p_actor_id uuid,p_device_id uuid,p_observations jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$ declare d app_private.vehicle_tracking_devices%rowtype; a app_private.vehicle_tracking_assignments%rowtype; item jsonb; prior app_private.vehicle_location_ingestions%rowtype; fp text; receipt jsonb; receipts jsonb:='[]'::jsonb; oid uuid; rec timestamptz; lat numeric; lon numeric; acc numeric; reject text; route_id uuid; day_id uuid; team uuid; pos extensions.geography; begin
 if jsonb_typeof(p_observations)<>'array' or jsonb_array_length(p_observations)=0 or jsonb_array_length(p_observations)>app_private.tracking_setting('vehicle-tracking.max-batch-size',100) then raise exception 'invalid_batch_size' using errcode='22023'; end if;
 select * into d from app_private.vehicle_tracking_devices where vehicle_tracking_device_id=p_device_id for update;
 if d.vehicle_tracking_device_id is null or d.owner_user_id<>p_actor_id or d.lifecycle_status<>'active' or not (
  app_private.user_has_global_permission(p_actor_id,'vehicle_tracking.ingest') or app_private.user_has_region_permission(p_actor_id,'vehicle_tracking.ingest',d.service_region_id) or exists(
   select 1 from public.user_profiles up join app_private.user_roles ur on ur.user_id=up.user_id join app_private.role_permissions rp on rp.role_id=ur.role_id join app_private.user_access_scopes s on s.user_id=up.user_id join app_private.vehicles v on v.vehicle_id=d.vehicle_id
   where up.user_id=p_actor_id and up.is_active and rp.permission_key='vehicle_tracking.ingest' and s.scope_kind='team' and s.scope_id=v.default_team_id))
 then raise exception 'permission denied' using errcode='42501'; end if;
 select * into a from app_private.vehicle_tracking_assignments where vehicle_tracking_device_id=p_device_id and effective_to is null;
 if a.vehicle_tracking_assignment_id is null then raise exception 'missing_vehicle_assignment' using errcode='55000'; end if;
 for item in select value from jsonb_array_elements(p_observations) loop
  oid:=(item->>'observationId')::uuid; fp:=md5(item::text); select * into prior from app_private.vehicle_location_ingestions where observation_id=oid or (vehicle_tracking_device_id=p_device_id and idempotency_key=item->>'idempotencyKey') order by server_received_at limit 1;
  if prior.observation_id is not null then receipt:=case when prior.request_fingerprint=fp then prior.receipt||jsonb_build_object('outcome','duplicate') else jsonb_build_object('observationId',oid,'outcome','conflict','rejectionCode','idempotency_key_reused') end; receipts:=receipts||jsonb_build_array(receipt); continue; end if;
  reject:=null; rec:=(item->>'recordedAt')::timestamptz; lat:=(item->>'latitude')::numeric; lon:=(item->>'longitude')::numeric; acc:=(item->>'accuracyMetres')::numeric;
  if lat not between -90 and 90 or lon not between -180 and 180 then reject:='invalid_coordinates'; elsif acc<0 or acc>10000 then reject:='invalid_accuracy'; elsif rec>now()+make_interval(secs=>app_private.tracking_setting('vehicle-tracking.max-future-skew-seconds',300)::integer) then reject:='future_timestamp'; elsif rec<now()-make_interval(hours=>app_private.tracking_setting('vehicle-tracking.max-observation-age-hours',168)::integer) then reject:='observation_too_old'; end if;
  receipt:=jsonb_build_object('observationId',oid,'outcome',case when reject is null then 'accepted' else 'rejected' end,'serverReceivedAt',now())||case when reject is null then '{}'::jsonb else jsonb_build_object('rejectionCode',reject) end;
  insert into app_private.vehicle_location_ingestions(observation_id,vehicle_tracking_device_id,idempotency_key,request_fingerprint,outcome,rejection_code,receipt) values(oid,p_device_id,item->>'idempotencyKey',fp,case when reject is null then 'accepted' else 'rejected' end,reject,receipt);
  if reject is null then
   select route_operation_id,operational_day_id,current_team_id into route_id,day_id,team from app_private.route_operations where current_vehicle_id=a.vehicle_id and lifecycle_status in ('available','accepted','in_progress','suspended') order by route_date desc limit 1;
   pos:=extensions.st_setsrid(extensions.st_makepoint(lon::double precision,lat::double precision),4326)::extensions.geography;
   insert into app_private.vehicle_location_observations(observation_id,vehicle_tracking_device_id,vehicle_id,service_region_id,route_operation_id,operational_day_id,team_id,recorded_at,latitude,longitude,position,accuracy_metres,altitude_metres,heading_degrees,speed_metres_per_second,client_sequence,idempotency_key,correlation_id,source_provider,ingestion_status,quality_signals)
   values(oid,p_device_id,a.vehicle_id,d.service_region_id,route_id,day_id,team,rec,lat,lon,pos,acc,nullif(item->>'altitudeMetres','')::numeric,nullif(item->>'headingDegrees','')::numeric,nullif(item->>'speedMetresPerSecond','')::numeric,(item->>'clientSequence')::bigint,item->>'idempotencyKey',(item->>'correlationId')::uuid,coalesce(item->>'sourceProvider',d.provider_key),case when acc>100 then 'poor_quality' else 'accepted' end,case when acc>100 then jsonb_build_object('poorAccuracy',true) else '{}'::jsonb end);
   insert into app_private.current_vehicle_positions(vehicle_id,vehicle_tracking_device_id,observation_id,service_region_id,route_operation_id,team_id,recorded_at,server_received_at,latitude,longitude,position,accuracy_metres,heading_degrees,speed_metres_per_second)
   select a.vehicle_id,p_device_id,oid,d.service_region_id,route_id,team,rec,now(),lat,lon,pos,acc,nullif(item->>'headingDegrees','')::numeric,nullif(item->>'speedMetresPerSecond','')::numeric
   on conflict(vehicle_id) do update set vehicle_tracking_device_id=excluded.vehicle_tracking_device_id,observation_id=excluded.observation_id,route_operation_id=excluded.route_operation_id,team_id=excluded.team_id,recorded_at=excluded.recorded_at,server_received_at=excluded.server_received_at,latitude=excluded.latitude,longitude=excluded.longitude,position=excluded.position,accuracy_metres=excluded.accuracy_metres,heading_degrees=excluded.heading_degrees,speed_metres_per_second=excluded.speed_metres_per_second,updated_at=now()
   where (excluded.recorded_at,excluded.server_received_at,excluded.observation_id)>(app_private.current_vehicle_positions.recorded_at,app_private.current_vehicle_positions.server_received_at,app_private.current_vehicle_positions.observation_id);
  end if; receipts:=receipts||jsonb_build_array(receipt);
 end loop;
 update app_private.vehicle_tracking_devices set last_seen_at=now(),last_successful_position_at=case when exists(select 1 from jsonb_array_elements(receipts) x where x->>'outcome'='accepted') then now() else last_successful_position_at end where vehicle_tracking_device_id=p_device_id;
 return jsonb_build_object('deviceId',p_device_id,'receipts',receipts); end $$;

create or replace function app_private.tracking_health(d app_private.vehicle_tracking_devices,p app_private.current_vehicle_positions,p_now timestamptz default now())
returns text language sql stable set search_path='' as $$ select case when d.lifecycle_status='suspended' then 'suspended' when d.lifecycle_status='revoked' then 'revoked' when d.lifecycle_status<>'active' then 'unknown' when p.recorded_at is null then 'unknown' when extract(epoch from(p_now-p.recorded_at))<=app_private.tracking_setting('vehicle-tracking.healthy-seconds',120) then 'healthy' when extract(epoch from(p_now-p.recorded_at))<=app_private.tracking_setting('vehicle-tracking.delayed-seconds',300) then 'delayed' when extract(epoch from(p_now-p.recorded_at))<=app_private.tracking_setting('vehicle-tracking.stale-seconds',900) then 'stale' else 'offline' end $$;

create or replace function api.vehicle_tracking_positions(p_actor_id uuid,p_region_id uuid,p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$ begin perform app_private.require_vehicle_tracking_access(p_actor_id,'vehicle_tracking.read',p_region_id);
 return coalesce((select jsonb_agg(jsonb_build_object('vehicleId',v.vehicle_id,'vehicleDisplayName',v.display_name,'registrationReference',v.registration_reference,'deviceId',d.vehicle_tracking_device_id,'deviceName',d.device_name,'deviceStatus',d.lifecycle_status,'teamId',p.team_id,'teamName',t.name,'routeOperationId',p.route_operation_id,'latitude',p.latitude,'longitude',p.longitude,'recordedAt',p.recorded_at,'serverReceivedAt',p.server_received_at,'ageSeconds',extract(epoch from(p_now-p.recorded_at))::integer,'accuracyMetres',p.accuracy_metres,'speedMetresPerSecond',p.speed_metres_per_second,'headingDegrees',p.heading_degrees,'health',app_private.tracking_health(d,p,p_now)) order by v.display_name)
 from app_private.vehicles v left join app_private.vehicle_tracking_devices d on d.vehicle_id=v.vehicle_id and d.lifecycle_status<>'retired' left join app_private.current_vehicle_positions p on p.vehicle_id=v.vehicle_id left join app_private.teams t on t.team_id=p.team_id where v.service_region_id=p_region_id),'[]'); end $$;

alter table app_private.vehicle_tracking_assignments enable row level security; alter table app_private.vehicle_location_observations enable row level security; alter table app_private.vehicle_location_ingestions enable row level security; alter table app_private.current_vehicle_positions enable row level security;
revoke all on app_private.vehicle_tracking_assignments,app_private.vehicle_location_observations,app_private.vehicle_location_ingestions,app_private.current_vehicle_positions from public,anon,authenticated;
grant select,insert,update,delete on app_private.vehicle_tracking_assignments,app_private.vehicle_location_observations,app_private.vehicle_location_ingestions,app_private.current_vehicle_positions to service_role;
revoke all on function app_private.require_vehicle_tracking_access(uuid,text,uuid),app_private.tracking_setting(text,numeric) from public; grant execute on function app_private.require_vehicle_tracking_access(uuid,text,uuid),app_private.tracking_setting(text,numeric) to service_role;
grant execute on function api.vehicle_tracking_device_list(uuid,uuid),api.vehicle_tracking_device_register(uuid,jsonb,uuid),api.vehicle_tracking_device_lifecycle(uuid,uuid,text,text,uuid),api.vehicle_tracking_device_assign(uuid,uuid,uuid,text,uuid),api.vehicle_tracking_assignment_history(uuid,uuid),api.vehicle_tracking_own_device(uuid),api.vehicle_tracking_ingest_batch(uuid,uuid,jsonb),api.vehicle_tracking_positions(uuid,uuid,timestamptz) to service_role;
