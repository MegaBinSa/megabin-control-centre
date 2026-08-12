begin;
select plan(24);
select has_table('app_private','route_plans','route plan aggregate exists');
select has_table('app_private','route_versions','immutable route versions exist');
select has_table('app_private','planned_routes','planned routes exist');
select has_table('app_private','planned_route_stops','planned stops exist');
select has_table('app_private','unassigned_route_services','unassigned work exists');
select has_function('api','route_generate',array['uuid','uuid','uuid','boolean','uuid','text'],'owning generation boundary exists');

insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
('b1000000-0000-4000-8000-000000000001','routes@test.invalid','{}','{}'),('b1000000-0000-4000-8000-000000000002','driver-routes@test.invalid','{}','{}');
insert into public.user_profiles(user_id,display_name) values ('b1000000-0000-4000-8000-000000000001','Route Manager'),('b1000000-0000-4000-8000-000000000002','Route Driver');
insert into app_private.user_roles(user_id,role_id) select 'b1000000-0000-4000-8000-000000000001'::uuid,role_id from app_private.roles where role_key='operations_manager'
union all select 'b1000000-0000-4000-8000-000000000002'::uuid,role_id from app_private.roles where role_key='driver_team';
insert into app_private.service_regions(service_region_id,name,region_code) values ('b2000000-0000-4000-8000-000000000001','Route North','ROUTE_N');
insert into app_private.user_access_scopes(user_id,scope_kind,scope_id) values ('b1000000-0000-4000-8000-000000000001','service_region','b2000000-0000-4000-8000-000000000001');
insert into app_private.depots(depot_id,service_region_id,name,address_line_1,suburb,city) values ('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Route Depot','1 Route','Test','Pretoria');
insert into app_private.vehicles(vehicle_id,service_region_id,default_depot_id,registration_reference,display_name,estimated_drum_capacity) values ('b4000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','RP-01','Route Vehicle',4);
insert into app_private.teams(team_id,service_region_id,default_depot_id,team_code,name,normal_vehicle_id,working_hours) values ('b5000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','ROUTE_A','Route Team','b4000000-0000-4000-8000-000000000001','{"maxMinutes":60}');
insert into app_private.staff(staff_id,display_name,operational_role,default_team_id) values ('b6000000-0000-4000-8000-000000000001','Route Driver','driver','b5000000-0000-4000-8000-000000000001');
insert into app_private.territories(territory_id,service_region_id,name) values ('b7000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','Route Territory');
insert into app_private.territory_eligible_teams values ('b7000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',now());
insert into app_private.operational_days(operational_day_id,service_date,service_region_id,timezone,lifecycle_status,locked_at,locked_by) values ('b8000000-0000-4000-8000-000000000001','2026-08-20','b2000000-0000-4000-8000-000000000001','Africa/Johannesburg','locked',now(),'b1000000-0000-4000-8000-000000000001');
insert into app_private.daily_roster_entries(daily_roster_entry_id,operational_day_id,team_id,normal_vehicle_id,assigned_vehicle_id,normal_depot_id,assigned_depot_id) values ('b9000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001');
insert into app_private.daily_roster_staff_assignments(daily_roster_entry_id,staff_id,expected_team_id,assignment_role) values ('b9000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','driver');
insert into app_private.clients(client_id,client_type,display_name,lifecycle_status,activated_at) values ('ba000000-0000-4000-8000-000000000001','individual','Route Client','active',now());
insert into app_private.service_addresses(service_address_id,address_line_1,suburb,city,latitude,longitude) values ('bb000000-0000-4000-8000-000000000001','10 Route','Test','Pretoria',-25.75,28.20),('bb000000-0000-4000-8000-000000000002','No Coordinate','Test','Pretoria',null,null);
insert into app_private.client_services(client_service_id,client_id,service_address_id,lifecycle_status,service_start_date,cadence_code) values ('bc000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','active','2026-01-01','weekly'),('bc000000-0000-4000-8000-000000000002','ba000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000002','active','2026-01-01','weekly');
insert into app_private.service_configurations(service_configuration_id,client_service_id,service_region_id,territory_id,default_team_id,configured_drum_count,operational_drum_unit_count,configured_collection_day,effective_from) values ('bd000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',2,2,4,'2026-01-01'),('bd000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',1,1,4,'2026-01-01');

select lives_ok($$select api.route_generate('b1000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','be000000-0000-4000-8000-000000000001',false,null,null)$$,'locked roster generates a plan');
select is((select count(*) from app_private.route_plans),1::bigint,'one plan exists for the operational day');
select is((select count(*) from app_private.route_versions),1::bigint,'first generation creates one version');
select is((select count(*) from app_private.planned_routes),1::bigint,'locked roster assignment creates one route');
select is((select count(*) from app_private.planned_route_stops),1::bigint,'eligible configured service becomes a stop');
select is((select count(*) from app_private.unassigned_route_services where reason_code='missing_coordinates'),1::bigint,'missing coordinates remain explicit');
select is((select planned_capacity_units from app_private.planned_routes),2,'drums are capacity units');
select is((select roster_entry_version from app_private.planned_routes),1,'roster version is snapshotted');
select lives_ok($$select api.route_generate('b1000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','be000000-0000-4000-8000-000000000002',false,null,null)$$,'repeat generation is idempotent');
select is((select count(*) from app_private.route_versions),1::bigint,'idempotent generation does not duplicate versions');
select throws_ok($$select api.route_generate('b1000000-0000-4000-8000-000000000002','b8000000-0000-4000-8000-000000000001','be000000-0000-4000-8000-000000000003',false,null,null)$$,'42501',null,'Driver Team cannot generate routes');
select is((api.route_validate('b1000000-0000-4000-8000-000000000001',(select route_version_id from app_private.route_versions))->>'valid')::boolean,true,'visible unassigned work is a nonblocking warning');
select lives_ok($$select api.route_transition('b1000000-0000-4000-8000-000000000001',(select route_version_id from app_private.route_versions),'ready',(select updated_at from app_private.route_versions),'be000000-0000-4000-8000-000000000004')$$,'valid draft becomes Ready');
select lives_ok($$select api.route_transition('b1000000-0000-4000-8000-000000000001',(select route_version_id from app_private.route_versions),'published',(select updated_at from app_private.route_versions),'be000000-0000-4000-8000-000000000005')$$,'Ready version publishes');
select is((select lifecycle_status from app_private.route_plans),'published','plan points to published lifecycle');
select throws_ok($$select api.route_stop_move('b1000000-0000-4000-8000-000000000001',(select planned_route_stop_id from app_private.planned_route_stops),(select planned_route_id from app_private.planned_routes),1,'try edit','be000000-0000-4000-8000-000000000006')$$,'55000',null,'published versions are immutable');
select ok((select count(*)>=2 from app_private.outbox_events where producer_module='routes'),'route changes append outbox events');
select ok((select count(*)>=1 from app_private.business_audit_facts where module_key='routes'),'generation writes an audit fact');
select * from finish(); rollback;
