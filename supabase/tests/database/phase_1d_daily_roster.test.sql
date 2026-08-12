begin;
select plan(26);
select has_table('app_private','operational_days','operational day table exists');
select has_function('api','roster_generate',array['uuid','uuid','date','uuid'],'roster generation boundary exists');

insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
('a1000000-0000-4000-8000-000000000001','roster@test.invalid','{}','{}'),('a1000000-0000-4000-8000-000000000002','other@test.invalid','{}','{}'),('a1000000-0000-4000-8000-000000000003','driver@test.invalid','{}','{}');
insert into public.user_profiles(user_id,display_name) values
('a1000000-0000-4000-8000-000000000001','Roster Manager'),('a1000000-0000-4000-8000-000000000002','Other Manager'),('a1000000-0000-4000-8000-000000000003','Driver');
insert into app_private.user_roles(user_id,role_id)
select 'a1000000-0000-4000-8000-000000000001'::uuid,role_id from app_private.roles where role_key='operations_manager'
union all select 'a1000000-0000-4000-8000-000000000002'::uuid,role_id from app_private.roles where role_key='operations_manager'
union all select 'a1000000-0000-4000-8000-000000000003'::uuid,role_id from app_private.roles where role_key='driver_team';
insert into app_private.service_regions(service_region_id,name,region_code) values ('a2000000-0000-4000-8000-000000000001','Roster North','ROSTER_N'),('a2000000-0000-4000-8000-000000000002','Roster South','ROSTER_S');
insert into app_private.user_access_scopes(user_id,scope_kind,scope_id) values ('a1000000-0000-4000-8000-000000000001','service_region','a2000000-0000-4000-8000-000000000001'),('a1000000-0000-4000-8000-000000000002','service_region','a2000000-0000-4000-8000-000000000002');
insert into app_private.depots(depot_id,service_region_id,name,address_line_1,suburb,city) values ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Roster Depot','1 Test','Test','Pretoria');
insert into app_private.vehicles(vehicle_id,service_region_id,default_depot_id,registration_reference,display_name) values
('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','R-01','Normal Vehicle'),
('a4000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','R-02','Substitute Vehicle');
insert into app_private.teams(team_id,service_region_id,default_depot_id,team_code,name,normal_vehicle_id) values
('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','TEAM_A','Team A','a4000000-0000-4000-8000-000000000001'),
('a5000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','TEAM_B','Team B',null);
insert into app_private.staff(staff_id,display_name,operational_role,default_team_id) values
('a6000000-0000-4000-8000-000000000001','Normal Driver','driver','a5000000-0000-4000-8000-000000000001'),
('a6000000-0000-4000-8000-000000000002','Absent Assistant','assistant','a5000000-0000-4000-8000-000000000001'),
('a6000000-0000-4000-8000-000000000003','Substitute Driver','driver','a5000000-0000-4000-8000-000000000002');
insert into app_private.staff_availability_windows(staff_id,service_region_id,starts_at,ends_at,full_day,availability_status,reason) values ('a6000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','2026-08-20T00:00:00+02','2026-08-21T00:00:00+02',true,'unavailable','Synthetic absence');

select lives_ok($$select api.roster_generate('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','2026-08-20','a7000000-0000-4000-8000-000000000001')$$,'roster generated from permanent configuration');
select is((select count(*) from app_private.operational_days where service_region_id='a2000000-0000-4000-8000-000000000001' and service_date='2026-08-20'),1::bigint,'one operational day per region/date');
select lives_ok($$select api.roster_generate('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','2026-08-20','a7000000-0000-4000-8000-000000000002')$$,'repeat generation is idempotent');
select is((select count(*) from app_private.daily_roster_entries),2::bigint,'generation does not duplicate entries');
select is((select count(*) from app_private.daily_roster_staff_assignments where staff_id='a6000000-0000-4000-8000-000000000002'),0::bigint,'unavailable staff excluded');
select is((api.roster_validate('a1000000-0000-4000-8000-000000000001',(select operational_day_id from app_private.operational_days))->>'ready')::boolean,false,'blocking draft cannot be ready');
select throws_ok($$select api.roster_transition('a1000000-0000-4000-8000-000000000001',(select operational_day_id from app_private.operational_days),'ready',(select updated_at from app_private.operational_days),null,'a7000000-0000-4000-8000-000000000003')$$,'22023',null,'readiness transition rejects blockers');
select throws_ok($$select api.roster_update_entry('a1000000-0000-4000-8000-000000000001',(select daily_roster_entry_id from app_private.daily_roster_entries where team_id='a5000000-0000-4000-8000-000000000002'),jsonb_build_object('assignedVehicleId','a4000000-0000-4000-8000-000000000002','assignedDepotId','a3000000-0000-4000-8000-000000000001','staffIds',jsonb_build_array('a6000000-0000-4000-8000-000000000003'),'expectedUpdatedAt',(select updated_at from app_private.daily_roster_entries where team_id='a5000000-0000-4000-8000-000000000002')),'a7000000-0000-4000-8000-000000000004')$$,'22023',null,'substitution requires reason');
select lives_ok($$select api.roster_update_entry('a1000000-0000-4000-8000-000000000001',(select daily_roster_entry_id from app_private.daily_roster_entries where team_id='a5000000-0000-4000-8000-000000000002'),jsonb_build_object('assignedVehicleId','a4000000-0000-4000-8000-000000000002','assignedDepotId','a3000000-0000-4000-8000-000000000001','staffIds',jsonb_build_array('a6000000-0000-4000-8000-000000000003'),'reason','Cover second team','expectedUpdatedAt',(select updated_at from app_private.daily_roster_entries where team_id='a5000000-0000-4000-8000-000000000002')),'a7000000-0000-4000-8000-000000000005')$$,'vehicle/staff substitution succeeds');
select is((select normal_vehicle_id from app_private.teams where team_id='a5000000-0000-4000-8000-000000000002'),null::uuid,'substitution does not change permanent team vehicle');
select is((select default_team_id from app_private.staff where staff_id='a6000000-0000-4000-8000-000000000003'),'a5000000-0000-4000-8000-000000000002'::uuid,'daily staff assignment does not change permanent membership');
select throws_ok($$select api.roster_update_entry('a1000000-0000-4000-8000-000000000001',(select daily_roster_entry_id from app_private.daily_roster_entries where team_id='a5000000-0000-4000-8000-000000000001'),jsonb_build_object('assignedVehicleId','a4000000-0000-4000-8000-000000000002','assignedDepotId','a3000000-0000-4000-8000-000000000001','staffIds',jsonb_build_array('a6000000-0000-4000-8000-000000000001'),'reason','Conflict','expectedUpdatedAt',(select updated_at from app_private.daily_roster_entries where team_id='a5000000-0000-4000-8000-000000000001')),'a7000000-0000-4000-8000-000000000006')$$,'23505',null,'duplicate vehicle assignment rejected');
select is((api.roster_validate('a1000000-0000-4000-8000-000000000001',(select operational_day_id from app_private.operational_days))->>'ready')::boolean,true,'valid roster passes readiness');
select lives_ok($$select api.roster_transition('a1000000-0000-4000-8000-000000000001',(select operational_day_id from app_private.operational_days),'ready',(select updated_at from app_private.operational_days),null,'a7000000-0000-4000-8000-000000000007')$$,'valid roster becomes Ready');
select lives_ok($$select api.roster_transition('a1000000-0000-4000-8000-000000000001',(select operational_day_id from app_private.operational_days),'locked',(select updated_at from app_private.operational_days),null,'a7000000-0000-4000-8000-000000000008')$$,'Ready roster locks');
select throws_ok($$select api.roster_update_entry('a1000000-0000-4000-8000-000000000001',(select daily_roster_entry_id from app_private.daily_roster_entries limit 1),jsonb_build_object('expectedUpdatedAt',(select updated_at from app_private.daily_roster_entries limit 1)),'a7000000-0000-4000-8000-000000000009')$$,'55000',null,'locked roster rejects edits');
select lives_ok($$select api.roster_transition('a1000000-0000-4000-8000-000000000001',(select operational_day_id from app_private.operational_days),'ready',(select updated_at from app_private.operational_days),'Emergency correction','a7000000-0000-4000-8000-000000000010')$$,'authorised unlock with reason succeeds');
select throws_ok($$select api.roster_update_entry('a1000000-0000-4000-8000-000000000001',(select daily_roster_entry_id from app_private.daily_roster_entries limit 1),'{"expectedUpdatedAt":"2020-01-01T00:00:00Z"}','a7000000-0000-4000-8000-000000000013')$$,'40001',null,'stale roster edit conflicts');
select ok((select count(*)>=3 from app_private.daily_roster_assignment_history),'assignment history preserved');
select throws_ok($$select api.roster_find('a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','2026-08-20')$$,'42501',null,'cross-region roster denied');
select throws_ok($$select api.roster_generate('a1000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000001','2026-08-20','a7000000-0000-4000-8000-000000000011')$$,'42501',null,'Driver Team administration denied');
select throws_ok($$select api.availability_list('a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','2026-08-20','2026-08-21')$$,'42501',null,'cross-region availability denied');
insert into app_private.vehicle_availability_windows(vehicle_id,service_region_id,starts_at,ends_at,availability_status,reason) values ('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','2026-08-21T00:00:00+02','2026-08-22T00:00:00+02','maintenance','Synthetic maintenance');
select lives_ok($$select api.roster_generate('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','2026-08-21','a7000000-0000-4000-8000-000000000012')$$,'roster generation consumes vehicle availability windows');
select is((select assigned_vehicle_id from app_private.daily_roster_entries e join app_private.operational_days d using(operational_day_id) where d.service_date='2026-08-21' and e.team_id='a5000000-0000-4000-8000-000000000001'),null::uuid,'unavailable vehicle excluded from generated roster');
select * from finish(); rollback;
