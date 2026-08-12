begin;
select plan(31);
select has_table('app_private','route_optimization_attempts','optimization attempts exist');
select has_table('app_private','routing_provider_usage','safe usage telemetry exists');
select has_table('app_private','routing_provider_health','provider health projection exists');
select has_column('app_private','route_versions','optimization_attempt_id','versions reference accepted optimization');
select has_column('app_private','route_versions','estimate_mode','estimate mode is explicit');
select has_function('api','route_optimization_start',array['uuid','uuid','timestamptz','uuid','text','text','text'],'start boundary exists');
select has_function('api','route_optimization_complete',array['uuid','uuid','jsonb','integer','uuid'],'result validation boundary exists');
select has_function('api','route_optimization_apply',array['uuid','uuid','timestamptz','uuid'],'candidate apply boundary exists');
select ok((select rowsecurity from pg_tables where schemaname='app_private' and tablename='route_optimization_attempts'),'attempts use RLS defense in depth');
select is((select count(*) from app_private.permissions where permission_key in ('routes.optimize','routes.optimization.read','routes.optimization.apply')),3::bigint,'granular permissions registered');
select is((select default_value#>>'{}' from app_private.configuration_definitions where configuration_key='routes.routing-provider'),'fake-routing','fake routing is safe default');
select is((select default_value#>>'{}' from app_private.configuration_definitions where configuration_key='routes.optimization-provider'),'fake-optimizer','fake optimizer is safe default');
select is((select (default_value#>>'{}')::integer from app_private.configuration_definitions where configuration_key='routes.provider-max-retry-delay-ms'),5000,'provider retry-after delay is capped by safe configuration');
select ok(not has_table_privilege('authenticated','app_private.route_optimization_attempts','select'),'browser cannot read attempts directly');
select ok(not has_function_privilege('authenticated','api.route_optimization_start(uuid,uuid,timestamptz,uuid,text,text,text)','execute'),'browser cannot invoke privileged RPC');

insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
 ('e1000000-0000-4000-8000-000000000001','optimizer@test.invalid','{}','{}'),
 ('e1000000-0000-4000-8000-000000000002','other@test.invalid','{}','{}'),
 ('e1000000-0000-4000-8000-000000000003','driver-optimizer@test.invalid','{}','{}');
insert into public.user_profiles(user_id,display_name) values
 ('e1000000-0000-4000-8000-000000000001','Optimizer'),('e1000000-0000-4000-8000-000000000002','Other'),('e1000000-0000-4000-8000-000000000003','Driver');
insert into app_private.user_roles(user_id,role_id)
 select 'e1000000-0000-4000-8000-000000000001'::uuid,role_id from app_private.roles where role_key='operations_manager'
 union all select 'e1000000-0000-4000-8000-000000000002'::uuid,role_id from app_private.roles where role_key='operations_manager'
 union all select 'e1000000-0000-4000-8000-000000000003'::uuid,role_id from app_private.roles where role_key='driver_team';
insert into app_private.service_regions(service_region_id,name,region_code) values
 ('e2000000-0000-4000-8000-000000000001','Optimize North','OPT_N'),('e2000000-0000-4000-8000-000000000002','Optimize South','OPT_S');
insert into app_private.user_access_scopes(user_id,scope_kind,scope_id) values
 ('e1000000-0000-4000-8000-000000000001','service_region','e2000000-0000-4000-8000-000000000001'),
 ('e1000000-0000-4000-8000-000000000002','service_region','e2000000-0000-4000-8000-000000000002');
insert into app_private.depots(depot_id,service_region_id,name,address_line_1,suburb,city,latitude,longitude) values
 ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Optimize Depot','1 Depot','Test','Pretoria',-25.75,28.20);
insert into app_private.vehicles(vehicle_id,service_region_id,default_depot_id,registration_reference,display_name,estimated_drum_capacity) values
 ('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','OPT-01','Optimize Truck',10);
insert into app_private.teams(team_id,service_region_id,default_depot_id,team_code,name,normal_vehicle_id) values
 ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','OPT_A','Optimize Team','e4000000-0000-4000-8000-000000000001');
insert into app_private.staff(staff_id,display_name,operational_role,default_team_id) values ('e6000000-0000-4000-8000-000000000001','Optimize Driver','driver','e5000000-0000-4000-8000-000000000001');
insert into app_private.territories(territory_id,service_region_id,name) values ('e7000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Optimize Territory');
insert into app_private.territory_eligible_teams values ('e7000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001',now());
insert into app_private.operational_days(operational_day_id,service_date,service_region_id,timezone,lifecycle_status,locked_at,locked_by) values ('e8000000-0000-4000-8000-000000000001','2026-08-20','e2000000-0000-4000-8000-000000000001','Africa/Johannesburg','locked',now(),'e1000000-0000-4000-8000-000000000001');
insert into app_private.daily_roster_entries(daily_roster_entry_id,operational_day_id,team_id,assigned_vehicle_id,assigned_depot_id) values ('e9000000-0000-4000-8000-000000000001','e8000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001');
insert into app_private.daily_roster_staff_assignments(daily_roster_entry_id,staff_id,expected_team_id,assignment_role) values ('e9000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','driver');
insert into app_private.clients(client_id,client_type,display_name,lifecycle_status,activated_at) values ('ea000000-0000-4000-8000-000000000001','individual','Optimize Client','active',now());
insert into app_private.service_addresses(service_address_id,address_line_1,suburb,city,latitude,longitude) values ('eb000000-0000-4000-8000-000000000001','10 Optimize','Test','Pretoria',-25.76,28.22);
insert into app_private.client_services(client_service_id,client_id,service_address_id,lifecycle_status,service_start_date,cadence_code) values ('ec000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001','active','2026-01-01','weekly');
insert into app_private.service_configurations(service_configuration_id,client_service_id,service_region_id,territory_id,default_team_id,configured_drum_count,operational_drum_unit_count,configured_collection_day,effective_from) values ('ed000000-0000-4000-8000-000000000001','ec000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001',2,2,4,'2026-01-01');
select lives_ok($$select api.route_generate('e1000000-0000-4000-8000-000000000001','e8000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001',false,null,null)$$,'baseline version generated');
select throws_ok($$select api.route_optimization_start('e1000000-0000-4000-8000-000000000001',(select route_version_id from app_private.route_versions),now()-interval '1 day','ee000000-0000-4000-8000-000000000010','fake-routing','fake-optimizer','1')$$,'40001',null,'stale source write is rejected');
select lives_ok($$select api.route_optimization_start('e1000000-0000-4000-8000-000000000001',(select route_version_id from app_private.route_versions),(select updated_at from app_private.route_versions),'ee000000-0000-4000-8000-000000000002','fake-routing','fake-optimizer','1')$$,'optimization attempt starts');
select throws_ok($$select api.route_optimization_complete('e1000000-0000-4000-8000-000000000001',(select route_optimization_attempt_id from app_private.route_optimization_attempts),jsonb_build_object('routes',jsonb_build_array(jsonb_build_object('routeId',(select planned_route_id from app_private.planned_routes),'stopIds',jsonb_build_array((select planned_route_stop_id from app_private.planned_route_stops),(select planned_route_stop_id from app_private.planned_route_stops)),'travelDistanceMetres',800,'routeDurationMinutes',30)),'unassignedStopIds','[]'::jsonb,'warnings','[]'::jsonb),10,'ee000000-0000-4000-8000-000000000003')$$,'22023',null,'duplicate provider assignment is rejected');
select is((select count(*) from app_private.route_versions),1::bigint,'invalid result leaves source version intact');
select lives_ok($$select api.route_optimization_complete('e1000000-0000-4000-8000-000000000001',(select route_optimization_attempt_id from app_private.route_optimization_attempts),jsonb_build_object('routes',jsonb_build_array(jsonb_build_object('routeId',(select planned_route_id from app_private.planned_routes),'stopIds',jsonb_build_array((select planned_route_stop_id from app_private.planned_route_stops)),'travelDistanceMetres',800,'travelDurationSeconds',600,'routeDurationMinutes',20,'geometry',jsonb_build_object('format','geojson_linestring','coordinates',jsonb_build_array(jsonb_build_array(28.2,-25.75),jsonb_build_array(28.22,-25.76)),'source','provider_road'))),'unassignedStopIds','[]'::jsonb,'warnings','[]'::jsonb),10,'ee000000-0000-4000-8000-000000000004')$$,'valid result succeeds');
select is((select comparison->>'candidateDistanceMetres' from app_private.route_optimization_attempts),'800','candidate comparison recorded');
select lives_ok($$select api.route_optimization_apply('e1000000-0000-4000-8000-000000000001',(select route_optimization_attempt_id from app_private.route_optimization_attempts),(select updated_at from app_private.route_versions order by version_number limit 1),'ee000000-0000-4000-8000-000000000005')$$,'candidate applies as new Draft');
select is((select count(*) from app_private.route_versions),2::bigint,'candidate creates a new version');
select is((select generation_method from app_private.route_versions where version_number=1),'deterministic_baseline','source baseline remains unchanged');
select is((select generation_method from app_private.route_versions where version_number=2),'provider_optimized','new version identifies optimized strategy');
update app_private.route_versions set version_status='published' where version_number=2;
select throws_ok($$select api.route_optimization_start('e1000000-0000-4000-8000-000000000001',(select route_version_id from app_private.route_versions where version_number=2),(select updated_at from app_private.route_versions where version_number=2),'ee000000-0000-4000-8000-000000000006','fake-routing','fake-optimizer','1')$$,'55000',null,'published version cannot be optimized in place');
select throws_ok($$select api.route_optimization_get('e1000000-0000-4000-8000-000000000002',(select route_optimization_attempt_id from app_private.route_optimization_attempts order by requested_at limit 1))$$,'42501',null,'cross-region attempt read denied');
select throws_ok($$select api.route_optimization_get('e1000000-0000-4000-8000-000000000003',(select route_optimization_attempt_id from app_private.route_optimization_attempts order by requested_at limit 1))$$,'42501',null,'Driver Team optimization access denied');
select lives_ok($$select api.route_generate('e1000000-0000-4000-8000-000000000001','e8000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000007',true,(select route_version_id from app_private.route_versions where version_number=2),'Plan after publication')$$,'post-publication planning creates a new Draft');
select lives_ok($$select api.route_optimization_start('e1000000-0000-4000-8000-000000000001',(select route_version_id from app_private.route_versions where version_number=3),(select updated_at from app_private.route_versions where version_number=3),'ee000000-0000-4000-8000-000000000008','fake-routing','fake-optimizer','1')$$,'new post-publication Draft can be optimized');
select * from finish();
rollback;
