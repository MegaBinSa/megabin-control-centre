begin;
select plan(28);

select has_function('api','geography_map',array['uuid','uuid'],'scoped geography map exists');
select has_function('api','geography_point_query',array['uuid','double precision','double precision','uuid'],'point query exists');
select has_function('api','geography_impact_preview',array['uuid','uuid','jsonb','integer'],'impact preview exists');

insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
 ('91000000-0000-4000-8000-000000000001','geo-admin@test.invalid','{}','{}'),
 ('91000000-0000-4000-8000-000000000002','geo-other@test.invalid','{}','{}'),
 ('91000000-0000-4000-8000-000000000003','geo-driver@test.invalid','{}','{}');
insert into public.user_profiles(user_id,display_name) values
 ('91000000-0000-4000-8000-000000000001','Geography Admin'),('91000000-0000-4000-8000-000000000002','Other Region Admin'),('91000000-0000-4000-8000-000000000003','Driver');
insert into app_private.user_roles(user_id,role_id)
select '91000000-0000-4000-8000-000000000001'::uuid,role_id from app_private.roles where role_key='office_admin'
union all select '91000000-0000-4000-8000-000000000002'::uuid,role_id from app_private.roles where role_key='office_admin'
union all select '91000000-0000-4000-8000-000000000003'::uuid,role_id from app_private.roles where role_key='driver_team';
insert into app_private.service_regions(service_region_id,name,region_code) values
 ('92000000-0000-4000-8000-000000000001','Synthetic North','SYN_N'),
 ('92000000-0000-4000-8000-000000000002','Synthetic South','SYN_S');
insert into app_private.user_access_scopes(user_id,scope_kind,scope_id) values
 ('91000000-0000-4000-8000-000000000001','service_region','92000000-0000-4000-8000-000000000001'),
 ('91000000-0000-4000-8000-000000000002','service_region','92000000-0000-4000-8000-000000000002');
insert into app_private.depots(depot_id,service_region_id,name,address_line_1,suburb,city,latitude,longitude) values
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Synthetic Depot','1 Test Road','Test','Pretoria',-25.75,28.20);

select lives_ok($$ select api.geography_create_territory('91000000-0000-4000-8000-000000000001','{"serviceRegionId":"92000000-0000-4000-8000-000000000001","name":"West","priority":10,"geometry":{"type":"Polygon","coordinates":[[[28.10,-25.90],[28.30,-25.90],[28.30,-25.70],[28.10,-25.70],[28.10,-25.90]]]}}','94000000-0000-4000-8000-000000000001') $$,'valid polygon creation succeeds');
select throws_ok($$ select app_private.valid_territory_geometry('{"type":"Polygon","coordinates":[[[28,-25],[29,-24],[28,-24],[29,-25],[28,-25]]]}'::jsonb) $$,'22023',null,'self-intersection is rejected');
select lives_ok($$ select app_private.valid_territory_geometry('{"type":"MultiPolygon","coordinates":[[[[28.4,-25.9],[28.5,-25.9],[28.5,-25.8],[28.4,-25.8],[28.4,-25.9]]]]}'::jsonb) $$,'multipolygon is accepted');

insert into app_private.territories(territory_id,service_region_id,name,priority,boundary) values
 ('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','East',20,extensions.st_multi(extensions.st_geomfromtext('POLYGON((28.2 -25.9,28.4 -25.9,28.4 -25.7,28.2 -25.7,28.2 -25.9))',4326))),
 ('95000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','Inactive',99,extensions.st_multi(extensions.st_geomfromtext('POLYGON((28.2 -25.9,28.4 -25.9,28.4 -25.7,28.2 -25.7,28.2 -25.9))',4326))) ;
update app_private.territories set is_active=false where territory_id='95000000-0000-4000-8000-000000000002';
select is(jsonb_array_length(api.geography_point_query('91000000-0000-4000-8000-000000000001',-25.8,28.15,'92000000-0000-4000-8000-000000000001')->'containingTerritories'),1,'point inside one active territory');
select is(jsonb_array_length(api.geography_point_query('91000000-0000-4000-8000-000000000001',-25.8,28.25,'92000000-0000-4000-8000-000000000001')->'containingTerritories'),2,'overlap returns both active territories and excludes inactive');
select is(api.geography_point_query('91000000-0000-4000-8000-000000000001',-25.8,28.25,'92000000-0000-4000-8000-000000000001')->>'suggestedTerritoryId','95000000-0000-4000-8000-000000000001','higher priority wins');
update app_private.territories set priority=10 where territory_id='95000000-0000-4000-8000-000000000001';
select is((api.geography_point_query('91000000-0000-4000-8000-000000000001',-25.8,28.25,'92000000-0000-4000-8000-000000000001')->>'ambiguous')::boolean,true,'equal priority is ambiguous');
select ok(jsonb_array_length(api.geography_overlap_analysis('91000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001'))>0,'overlap analysis identifies intersection');
select throws_ok($$ select api.geography_map('91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001') $$,'42501',null,'cross-region map access denied');
select throws_ok($$ select api.geography_map('91000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001') $$,'42501',null,'driver geography administration denied');

select lives_ok($$ select api.geography_update_depot('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',jsonb_build_object('latitude',-25.76,'longitude',28.21,'geofenceRadiusMetres',250,'expectedUpdatedAt',(select updated_at from app_private.depots where depot_id='93000000-0000-4000-8000-000000000001')),'94000000-0000-4000-8000-000000000002') $$,'depot geography update succeeds');
select is((select geofence_radius_metres from app_private.depots where depot_id='93000000-0000-4000-8000-000000000001'),250,'depot geofence persisted');
select throws_ok($$ select api.geography_update_depot('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','{"latitude":-25.7,"longitude":28.2,"geofenceRadiusMetres":100,"expectedUpdatedAt":"2020-01-01T00:00:00Z"}','94000000-0000-4000-8000-000000000003') $$,'40001',null,'stale depot edit conflicts');
select ok((select count(*)=1 from app_private.business_audit_facts where action_key='geography.depot_location_changed'),'depot change audited');
select ok((select count(*)=1 from app_private.outbox_events where event_name='Geography.TerritoryCreated'),'territory creation emits durable event');

insert into app_private.clients(client_id,client_type,display_name,lifecycle_status,activated_at) values ('96000000-0000-4000-8000-000000000001','individual','Synthetic Geography Client','active',now());
insert into app_private.service_addresses(service_address_id,address_line_1,suburb,city,latitude,longitude,geocoding_status,validation_status) values ('96000000-0000-4000-8000-000000000002','1 Geography Test','Test','Pretoria',-25.8,28.15,'geocoded','valid');
insert into app_private.client_services(client_service_id,client_id,service_address_id,lifecycle_status) values ('96000000-0000-4000-8000-000000000003','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','active');
insert into app_private.service_configurations(client_service_id,service_region_id,territory_id,configured_drum_count,operational_drum_unit_count,effective_from) select '96000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001',territory_id,1,1,current_date-10 from app_private.territories where name='West';

select is(api.geography_service_context('91000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002')->>'suggestedTerritoryId',(select territory_id::text from app_private.territories where name='West'),'service-address context returns normal suggestion');
select lives_ok($$ select api.geography_set_override('91000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000001',false,'94000000-0000-4000-8000-000000000004') $$,'permanent territory override succeeds through Service Configuration boundary');
select is((select territory_is_override from app_private.service_configurations where client_service_id='96000000-0000-4000-8000-000000000003' and effective_to is null),true,'permanent override flag persists');
select lives_ok($$ select api.geography_set_override('91000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003',null,true,'94000000-0000-4000-8000-000000000005') $$,'removing override returns to spatial suggestion');
select ok(jsonb_array_length(api.geography_impact_preview('91000000-0000-4000-8000-000000000001',(select territory_id from app_private.territories where name='West'),'{"type":"Polygon","coordinates":[[[28.10,-25.90],[28.12,-25.90],[28.12,-25.70],[28.10,-25.70],[28.10,-25.90]]]}'::jsonb,10))>0,'geometry impact preview identifies affected service without writing');
select lives_ok($$ select api.geography_save_territory('91000000-0000-4000-8000-000000000001',(select territory_id from app_private.territories where name='West'),jsonb_build_object('name','West','priority',10,'service_status','active','is_active',true,'preferred_collection_days','[]'::jsonb,'eligible_team_ids','[]'::jsonb,'geometry','{"type":"Polygon","coordinates":[[[28.10,-25.90],[28.12,-25.90],[28.12,-25.70],[28.10,-25.70],[28.10,-25.90]]]}'::jsonb,'expected_updated_at',(select updated_at from app_private.territories where name='West')),'94000000-0000-4000-8000-000000000006') $$,'saving geometry creates authoritative territory change');
select ok((select count(*)>0 from app_private.geography_assignment_reviews where client_service_id='96000000-0000-4000-8000-000000000003' and review_status='open'),'geometry save creates assignment review');
select lives_ok($$ select api.geography_resolve_review('91000000-0000-4000-8000-000000000001',(select geography_assignment_review_id from app_private.geography_assignment_reviews where client_service_id='96000000-0000-4000-8000-000000000003' and review_status='open' limit 1),'dismiss',(select updated_at from app_private.geography_assignment_reviews where client_service_id='96000000-0000-4000-8000-000000000003' and review_status='open' limit 1),'94000000-0000-4000-8000-000000000007') $$,'review dismissal preserves current assignment');
select lives_ok($$ select api.geography_save_territory('91000000-0000-4000-8000-000000000001',(select territory_id from app_private.territories where name='West'),jsonb_build_object('name','West','priority',11,'service_status','active','is_active',true,'preferred_collection_days','[]'::jsonb,'eligible_team_ids','[]'::jsonb,'geometry','{"type":"Polygon","coordinates":[[[28.10,-25.90],[28.30,-25.90],[28.30,-25.70],[28.10,-25.70],[28.10,-25.90]]]}'::jsonb,'expected_updated_at',(select updated_at from app_private.territories where name='West')),'94000000-0000-4000-8000-000000000008') $$,'priority/geometry change creates a confirmable review');
select lives_ok($$ select api.geography_resolve_review('91000000-0000-4000-8000-000000000001',(select geography_assignment_review_id from app_private.geography_assignment_reviews where client_service_id='96000000-0000-4000-8000-000000000003' and review_status='open' order by created_at desc limit 1),'confirm',(select updated_at from app_private.geography_assignment_reviews where client_service_id='96000000-0000-4000-8000-000000000003' and review_status='open' order by created_at desc limit 1),'94000000-0000-4000-8000-000000000009') $$,'review confirmation replaces assignment through owning Service Configuration helper');

select * from finish();
rollback;
