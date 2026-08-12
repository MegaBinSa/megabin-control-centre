-- Phase 1C authoritative geography administration.

insert into app_private.permissions(permission_key,description) values
 ('geography.read','Read geography configuration within an assigned service region'),
 ('geography.write','Manage geography configuration within an assigned service region')
on conflict do nothing;

insert into app_private.role_permissions(role_id,permission_key)
select role_id,permission_key from app_private.roles cross join app_private.permissions
where role_key in ('director_admin','operations_manager','office_admin') and permission_key in ('geography.read','geography.write')
on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
select role_id,permission_key from app_private.roles cross join app_private.permissions
where role_key='system_admin_developer' and permission_key='geography.read'
on conflict do nothing;

create table app_private.territory_changes(
 territory_change_id uuid primary key default gen_random_uuid(),
 territory_id uuid not null references app_private.territories,
 actor_id uuid references auth.users on delete set null,
 correlation_id uuid not null,
 previous_geometry extensions.geometry(multipolygon,4326),
 new_geometry extensions.geometry(multipolygon,4326),
 previous_priority integer not null,
 new_priority integer not null,
 created_at timestamptz not null default now()
);

create table app_private.geography_assignment_reviews(
 geography_assignment_review_id uuid primary key default gen_random_uuid(),
 territory_change_id uuid not null references app_private.territory_changes,
 client_service_id uuid not null references app_private.client_services,
 service_address_id uuid not null references app_private.service_addresses,
 previous_suggested_territory_id uuid references app_private.territories,
 new_suggested_territory_id uuid references app_private.territories,
 current_territory_id uuid references app_private.territories,
 territory_is_override boolean not null,
 reason text not null check(reason in ('fell_outside','now_inside','priority_changed','ambiguous')),
 review_status text not null default 'open' check(review_status in ('open','confirmed','dismissed')),
 created_at timestamptz not null default now(),
 resolved_by uuid references auth.users on delete set null,
 resolved_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(territory_change_id,client_service_id)
);
create index geography_reviews_status_idx on app_private.geography_assignment_reviews(review_status,created_at);
create index geography_reviews_service_idx on app_private.geography_assignment_reviews(client_service_id);
create index geography_reviews_change_idx on app_private.geography_assignment_reviews(territory_change_id);
alter table app_private.territory_changes enable row level security;
alter table app_private.geography_assignment_reviews enable row level security;
revoke all on app_private.territory_changes,app_private.geography_assignment_reviews from public,anon,authenticated;
grant select,insert,update on app_private.territory_changes,app_private.geography_assignment_reviews to service_role;

create or replace function app_private.valid_territory_geometry(p_geojson jsonb)
returns extensions.geometry language plpgsql immutable set search_path='' as $$
declare shape extensions.geometry;
begin
 if p_geojson is null then raise exception 'geometry_required' using errcode='22023'; end if;
 begin shape:=extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text),4326); exception when others then raise exception 'malformed_geometry' using errcode='22023'; end;
 if extensions.st_isempty(shape) then raise exception 'empty_geometry' using errcode='22023'; end if;
 if extensions.geometrytype(shape) not in ('POLYGON','MULTIPOLYGON') then raise exception 'unsupported_geometry_type' using errcode='22023'; end if;
 if not extensions.st_isvalid(shape) then raise exception 'invalid_geometry: %',extensions.st_isvalidreason(shape) using errcode='22023'; end if;
 return extensions.st_multi(shape)::extensions.geometry(multipolygon,4326);
end $$;

create or replace function app_private.territory_candidates(p_point extensions.geometry,p_region_id uuid default null,p_replace_id uuid default null,p_replace_geometry extensions.geometry default null,p_replace_priority integer default null)
returns table(territory_id uuid,name text,priority integer,service_region_id uuid,default_depot_id uuid) language sql stable set search_path='' as $$
 select t.territory_id,t.name,case when t.territory_id=p_replace_id then coalesce(p_replace_priority,t.priority) else t.priority end,t.service_region_id,t.default_depot_id
 from app_private.territories t
 where t.is_active and t.service_status='active' and (p_region_id is null or t.service_region_id=p_region_id)
 and extensions.st_covers(case when t.territory_id=p_replace_id then coalesce(p_replace_geometry,t.boundary) else t.boundary end,p_point)
 order by 3 desc,t.name;
$$;

create or replace function api.geography_map(p_actor_id uuid,p_service_region_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not app_private.user_has_region_permission(p_actor_id,'geography.read',p_service_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
 return jsonb_build_object(
  'territories',coalesce((select jsonb_agg(jsonb_build_object('territoryId',t.territory_id,'name',t.name,'priority',t.priority,'serviceRegionId',t.service_region_id,'defaultDepotId',t.default_depot_id,'serviceStatus',t.service_status,'isActive',t.is_active,'preferredCollectionDays',t.preferred_collection_days,'eligibleTeamIds',(select coalesce(jsonb_agg(et.team_id),'[]'::jsonb) from app_private.territory_eligible_teams et where et.territory_id=t.territory_id),'geometry',case when t.boundary is null then null else extensions.st_asgeojson(t.boundary)::jsonb end,'updatedAt',t.updated_at) order by t.priority desc) from app_private.territories t where t.service_region_id=p_service_region_id),'[]'::jsonb),
  'depots',coalesce((select jsonb_agg(jsonb_build_object('depotId',d.depot_id,'name',d.name,'serviceRegionId',d.service_region_id,'latitude',d.latitude,'longitude',d.longitude,'geofenceRadiusMetres',d.geofence_radius_metres,'isActive',d.is_active,'updatedAt',d.updated_at)) from app_private.depots d where d.service_region_id=p_service_region_id),'[]'::jsonb),
  'addresses',coalesce((select jsonb_agg(distinct jsonb_build_object('serviceAddressId',a.service_address_id,'latitude',a.latitude,'longitude',a.longitude,'validationStatus',a.validation_status)) from app_private.service_addresses a join app_private.client_services s on s.service_address_id=a.service_address_id join app_private.service_configurations c on c.client_service_id=s.client_service_id and c.effective_to is null where c.service_region_id=p_service_region_id and a.location is not null),'[]'::jsonb));
end $$;

create or replace function api.geography_create_territory(p_actor_id uuid,p_body jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare territory app_private.territories%rowtype; shape extensions.geometry; team_id jsonb;
begin
 if not app_private.user_has_region_permission(p_actor_id,'geography.write',(p_body->>'serviceRegionId')::uuid) then raise exception 'permission denied' using errcode='42501'; end if;
 shape:=app_private.valid_territory_geometry(p_body->'geometry');
 insert into app_private.territories(service_region_id,name,priority,default_depot_id,boundary,preferred_collection_days,service_status,is_active)
 values((p_body->>'serviceRegionId')::uuid,p_body->>'name',coalesce((p_body->>'priority')::integer,0),nullif(p_body->>'defaultDepotId','')::uuid,shape,coalesce(array(select jsonb_array_elements_text(coalesce(p_body->'preferredCollectionDays','[]'))::smallint),'{}'),coalesce(p_body->>'serviceStatus','active'),coalesce((p_body->>'isActive')::boolean,true)) returning * into territory;
 for team_id in select * from jsonb_array_elements(coalesce(p_body->'eligibleTeamIds','[]')) loop insert into app_private.territory_eligible_teams values(territory.territory_id,(team_id#>>'{}')::uuid,now()); end loop;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('geography.territory_created',p_actor_id,'geography','territory',territory.territory_id,p_correlation_id,to_jsonb(territory));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('geography','Geography.TerritoryCreated',1,'territory',territory.territory_id,jsonb_build_object('territoryId',territory.territory_id),p_correlation_id,'user',p_actor_id::text,now());
 return to_jsonb(territory)||jsonb_build_object('geometry',extensions.st_asgeojson(shape)::jsonb);
end $$;

create or replace function app_private.replace_service_territory_assignment(p_actor_id uuid,p_client_service_id uuid,p_territory_id uuid,p_is_override boolean,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare config app_private.service_configurations%rowtype; result jsonb; replacement_from date;
begin
 select * into config from app_private.service_configurations where client_service_id=p_client_service_id and effective_to is null for update;
 if config.service_configuration_id is null then raise exception 'not found' using errcode='P0002'; end if;
 if p_territory_id is not null and not exists(select 1 from app_private.territories t where t.territory_id=p_territory_id and t.service_region_id=config.service_region_id) then raise exception 'territory_region_mismatch' using errcode='22023'; end if;
 replacement_from:=greatest(current_date,config.effective_from+1);
 update app_private.service_configurations set effective_to=replacement_from-1,updated_at=now() where service_configuration_id=config.service_configuration_id;
 insert into app_private.service_configurations(client_service_id,service_region_id,territory_id,territory_is_override,depot_id,default_team_id,configured_drum_count,operational_drum_unit_count,configured_collection_day,access_configuration,effective_from)
 values(config.client_service_id,config.service_region_id,p_territory_id,p_is_override,config.depot_id,config.default_team_id,config.configured_drum_count,config.operational_drum_unit_count,config.configured_collection_day,config.access_configuration,replacement_from) returning to_jsonb(service_configurations.*) into result;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,before_state,after_state) values('service_configuration.territory_assignment_replaced',p_actor_id,'service-configuration','client-service',p_client_service_id,p_correlation_id,to_jsonb(config),result);
 return result;
end $$;

create or replace function api.geography_update_depot(p_actor_id uuid,p_depot_id uuid,p_body jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare depot app_private.depots%rowtype; result jsonb;
begin
 select * into depot from app_private.depots where depot_id=p_depot_id for update;
 if depot.depot_id is null then raise exception 'not found' using errcode='P0002'; end if;
 if not app_private.user_has_region_permission(p_actor_id,'geography.write',depot.service_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
 if (p_body->>'expectedUpdatedAt')::timestamptz<>depot.updated_at then raise exception 'stale_update' using errcode='40001'; end if;
 update app_private.depots set latitude=(p_body->>'latitude')::numeric,longitude=(p_body->>'longitude')::numeric,geofence_radius_metres=(p_body->>'geofenceRadiusMetres')::integer,updated_at=now() where depot_id=p_depot_id returning to_jsonb(depots.*) into result;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,before_state,after_state) values('geography.depot_location_changed',p_actor_id,'geography','depot',p_depot_id,p_correlation_id,to_jsonb(depot),result);
 return result;
end $$;

create or replace function api.geography_service_context(p_actor_id uuid,p_service_address_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare address app_private.service_addresses%rowtype; config app_private.service_configurations%rowtype; client_service_id uuid; candidates jsonb; suggested uuid; ambiguous boolean;
begin
 select * into address from app_private.service_addresses where service_address_id=p_service_address_id;
 select c.* into config from app_private.client_services s join app_private.service_configurations c on c.client_service_id=s.client_service_id and c.effective_to is null where s.service_address_id=p_service_address_id limit 1;
 select s.client_service_id into client_service_id from app_private.client_services s where s.service_address_id=p_service_address_id and s.client_service_id=config.client_service_id;
 if address.service_address_id is null or config.service_configuration_id is null then raise exception 'not found' using errcode='P0002'; end if;
 if not app_private.user_has_region_permission(p_actor_id,'geography.read',config.service_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(c)),'[]'),(array_agg(c.territory_id order by c.priority desc))[1],count(*) filter(where c.priority=(select max(x.priority) from app_private.territory_candidates(address.location::extensions.geometry,config.service_region_id) x))>1 into candidates,suggested,ambiguous from app_private.territory_candidates(address.location::extensions.geometry,config.service_region_id) c;
 return jsonb_build_object('serviceAddressId',p_service_address_id,'clientServiceId',client_service_id,'latitude',address.latitude,'longitude',address.longitude,'serviceRegionId',config.service_region_id,'containingTerritories',candidates,'suggestedTerritoryId',case when ambiguous then null else suggested end,'currentTerritoryId',config.territory_id,'territoryIsOverride',config.territory_is_override,'ambiguous',ambiguous,'mismatch',not config.territory_is_override and config.territory_id is distinct from suggested);
end $$;

create or replace function api.geography_point_query(p_actor_id uuid,p_latitude double precision,p_longitude double precision,p_service_region_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare point extensions.geometry:=extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326); top_priority integer; top_count integer; items jsonb;
begin
 if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'invalid_coordinates' using errcode='22023'; end if;
 if p_service_region_id is not null and not app_private.user_has_region_permission(p_actor_id,'geography.read',p_service_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
 select max(c.priority) into top_priority from app_private.territory_candidates(point,p_service_region_id) c;
 select count(*) into top_count from app_private.territory_candidates(point,p_service_region_id) c where c.priority=top_priority;
 select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into items from app_private.territory_candidates(point,p_service_region_id) c;
 return jsonb_build_object('containingTerritories',items,'suggestedTerritoryId',case when top_count=1 then (select c.territory_id from app_private.territory_candidates(point,p_service_region_id) c where c.priority=top_priority limit 1) end,'ambiguous',top_count>1);
end $$;

create or replace function api.geography_overlap_analysis(p_actor_id uuid,p_territory_id uuid,p_draft_geojson jsonb default null,p_priority integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare territory app_private.territories%rowtype; shape extensions.geometry;
begin
 select * into territory from app_private.territories where territory_id=p_territory_id;
 if territory.territory_id is null then raise exception 'not found' using errcode='P0002'; end if;
 if not app_private.user_has_region_permission(p_actor_id,'geography.read',territory.service_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
 shape:=case when p_draft_geojson is null then territory.boundary else app_private.valid_territory_geometry(p_draft_geojson) end;
 return coalesce((select jsonb_agg(jsonb_build_object('territoryId',other.territory_id,'name',other.name,'priority',other.priority,'overlapAreaSquareMetres',round(extensions.st_area(extensions.st_intersection(shape,other.boundary)::extensions.geography)),'winnerTerritoryId',case when coalesce(p_priority,territory.priority)>other.priority then territory.territory_id when coalesce(p_priority,territory.priority)<other.priority then other.territory_id end,'ambiguous',coalesce(p_priority,territory.priority)=other.priority)) from app_private.territories other where other.territory_id<>p_territory_id and other.service_region_id=territory.service_region_id and other.boundary OPERATOR(extensions.&&) shape and extensions.st_intersects(other.boundary,shape)),'[]'::jsonb);
end $$;

create or replace function api.geography_impact_preview(p_actor_id uuid,p_territory_id uuid,p_draft_geojson jsonb,p_priority integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare territory app_private.territories%rowtype; shape extensions.geometry;
begin
 select * into territory from app_private.territories where territory_id=p_territory_id;
 if not app_private.user_has_region_permission(p_actor_id,'geography.write',territory.service_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
 shape:=app_private.valid_territory_geometry(p_draft_geojson);
 return coalesce((select jsonb_agg(jsonb_build_object('clientServiceId',s.client_service_id,'serviceAddressId',a.service_address_id,'currentTerritoryId',c.territory_id,'territoryIsOverride',c.territory_is_override,'reason',case when p_priority is distinct from territory.priority then 'priority_changed' when c.territory_id=p_territory_id and not extensions.st_covers(shape,a.location::extensions.geometry) then 'fell_outside' when c.territory_id<>p_territory_id and extensions.st_covers(shape,a.location::extensions.geometry) then 'now_inside' else 'priority_changed' end)) from app_private.client_services s join app_private.service_addresses a on a.service_address_id=s.service_address_id join app_private.service_configurations c on c.client_service_id=s.client_service_id and c.effective_to is null where s.lifecycle_status='active' and c.service_region_id=territory.service_region_id and a.location is not null and (c.territory_id=p_territory_id or extensions.st_covers(shape,a.location::extensions.geometry))),'[]'::jsonb);
end $$;

create or replace function api.geography_save_territory(p_actor_id uuid,p_territory_id uuid,p_body jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare territory app_private.territories%rowtype; shape extensions.geometry; change_id uuid:=gen_random_uuid(); result jsonb;
begin
 select * into territory from app_private.territories where territory_id=p_territory_id for update;
 if territory.territory_id is null then raise exception 'not found' using errcode='P0002'; end if;
 if not app_private.user_has_region_permission(p_actor_id,'geography.write',territory.service_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
 if (p_body->>'expected_updated_at')::timestamptz<>territory.updated_at then raise exception 'stale_update' using errcode='40001'; end if;
 shape:=app_private.valid_territory_geometry(p_body->'geometry');
 insert into app_private.territory_changes(territory_change_id,territory_id,actor_id,correlation_id,previous_geometry,new_geometry,previous_priority,new_priority) values(change_id,p_territory_id,p_actor_id,p_correlation_id,territory.boundary,shape,territory.priority,coalesce((p_body->>'priority')::integer,territory.priority));
 insert into app_private.geography_assignment_reviews(territory_change_id,client_service_id,service_address_id,previous_suggested_territory_id,new_suggested_territory_id,current_territory_id,territory_is_override,reason)
 select change_id,s.client_service_id,a.service_address_id,c.territory_id,case when extensions.st_covers(shape,a.location::extensions.geometry) then p_territory_id end,c.territory_id,c.territory_is_override,case when c.territory_id=p_territory_id and not extensions.st_covers(shape,a.location::extensions.geometry) then 'fell_outside' when c.territory_id<>p_territory_id and extensions.st_covers(shape,a.location::extensions.geometry) then 'now_inside' else 'priority_changed' end
 from app_private.client_services s join app_private.service_addresses a on a.service_address_id=s.service_address_id join app_private.service_configurations c on c.client_service_id=s.client_service_id and c.effective_to is null where s.lifecycle_status='active' and c.service_region_id=territory.service_region_id and a.location is not null and (c.territory_id=p_territory_id or extensions.st_covers(shape,a.location::extensions.geometry));
 update app_private.territories set boundary=shape,priority=coalesce((p_body->>'priority')::integer,priority),name=coalesce(p_body->>'name',name),default_depot_id=nullif(p_body->>'default_depot_id','')::uuid,preferred_collection_days=coalesce(array(select jsonb_array_elements_text(coalesce(p_body->'preferred_collection_days','[]'))::smallint),preferred_collection_days),service_status=coalesce(p_body->>'service_status',service_status),is_active=coalesce((p_body->>'is_active')::boolean,is_active),updated_at=now() where territory_id=p_territory_id returning to_jsonb(territories.*) into result;
 delete from app_private.territory_eligible_teams where territory_id=p_territory_id;
 insert into app_private.territory_eligible_teams(territory_id,team_id) select p_territory_id,value::uuid from jsonb_array_elements_text(coalesce(p_body->'eligible_team_ids','[]'));
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,before_state,after_state) values('geography.territory_changed',p_actor_id,'geography','territory',p_territory_id,p_correlation_id,to_jsonb(territory),result);
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('geography','Geography.TerritoryGeometryChanged',1,'territory',p_territory_id,jsonb_build_object('territoryId',p_territory_id,'territoryChangeId',change_id),p_correlation_id,'user',p_actor_id::text,now());
 return jsonb_build_object('territory',result,'territoryChangeId',change_id,'reviewCount',(select count(*) from app_private.geography_assignment_reviews where territory_change_id=change_id));
end $$;

create or replace function api.geography_reviews(p_actor_id uuid,p_service_region_id uuid,p_status text default 'open')
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not app_private.user_has_region_permission(p_actor_id,'geography.read',p_service_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from app_private.geography_assignment_reviews r join app_private.service_configurations c on c.client_service_id=r.client_service_id and c.effective_to is null where c.service_region_id=p_service_region_id and r.review_status=p_status),'[]'::jsonb);
end $$;

create or replace function api.geography_resolve_review(p_actor_id uuid,p_review_id uuid,p_resolution text,p_expected_updated_at timestamptz,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare review app_private.geography_assignment_reviews%rowtype; config app_private.service_configurations%rowtype; result jsonb;
begin
 if p_resolution not in ('confirm','dismiss') then raise exception 'invalid_resolution' using errcode='22023'; end if;
 select * into review from app_private.geography_assignment_reviews where geography_assignment_review_id=p_review_id for update;
 select * into config from app_private.service_configurations where client_service_id=review.client_service_id and effective_to is null for update;
 if not app_private.user_has_region_permission(p_actor_id,'geography.write',config.service_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
 if review.updated_at<>p_expected_updated_at then raise exception 'stale_update' using errcode='40001'; end if;
 if p_resolution='confirm' and review.new_suggested_territory_id is not null then
  perform app_private.replace_service_territory_assignment(p_actor_id,config.client_service_id,review.new_suggested_territory_id,false,p_correlation_id);
 end if;
 update app_private.geography_assignment_reviews set review_status=case when p_resolution='confirm' then 'confirmed' else 'dismissed' end,resolved_by=p_actor_id,resolved_at=now(),updated_at=now() where geography_assignment_review_id=p_review_id returning to_jsonb(geography_assignment_reviews.*) into result;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('geography.assignment_review_resolved',p_actor_id,'geography','geography-assignment-review',p_review_id,p_correlation_id,result);
 return result;
end $$;

create or replace function api.geography_set_override(p_actor_id uuid,p_client_service_id uuid,p_territory_id uuid,p_remove boolean,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare config app_private.service_configurations%rowtype; result jsonb; target_territory_id uuid;
begin
 select * into config from app_private.service_configurations where client_service_id=p_client_service_id and effective_to is null for update;
 if not app_private.user_has_region_permission(p_actor_id,'master_data.write',config.service_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
 target_territory_id:=p_territory_id;
 if p_remove then select candidate.territory_id into target_territory_id from app_private.client_services service join app_private.service_addresses address on address.service_address_id=service.service_address_id cross join lateral app_private.territory_candidates(address.location::extensions.geometry,config.service_region_id) candidate where service.client_service_id=p_client_service_id and address.location is not null order by candidate.priority desc limit 1; end if;
 result:=app_private.replace_service_territory_assignment(p_actor_id,p_client_service_id,target_territory_id,not p_remove,p_correlation_id);
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('service_configuration.territory_override_changed',p_actor_id,'service-configuration','client-service',p_client_service_id,p_correlation_id,result);
 return result;
end $$;

revoke all on function api.geography_map(uuid,uuid),api.geography_create_territory(uuid,jsonb,uuid),api.geography_point_query(uuid,double precision,double precision,uuid),api.geography_overlap_analysis(uuid,uuid,jsonb,integer),api.geography_impact_preview(uuid,uuid,jsonb,integer),api.geography_save_territory(uuid,uuid,jsonb,uuid),api.geography_reviews(uuid,uuid,text),api.geography_resolve_review(uuid,uuid,text,timestamptz,uuid),api.geography_set_override(uuid,uuid,uuid,boolean,uuid),api.geography_update_depot(uuid,uuid,jsonb,uuid),api.geography_service_context(uuid,uuid) from public,anon,authenticated;
grant execute on function api.geography_map(uuid,uuid),api.geography_create_territory(uuid,jsonb,uuid),api.geography_point_query(uuid,double precision,double precision,uuid),api.geography_overlap_analysis(uuid,uuid,jsonb,integer),api.geography_impact_preview(uuid,uuid,jsonb,integer),api.geography_save_territory(uuid,uuid,jsonb,uuid),api.geography_reviews(uuid,uuid,text),api.geography_resolve_review(uuid,uuid,text,timestamptz,uuid),api.geography_set_override(uuid,uuid,uuid,boolean,uuid),api.geography_update_depot(uuid,uuid,jsonb,uuid),api.geography_service_context(uuid,uuid) to service_role;
