begin;

select plan(41);

select has_table('app_private','service_regions','service regions exist');
select has_table('app_private','depots','depots exist');
select has_table('app_private','territories','territories exist');
select has_table('app_private','teams','teams exist');
select has_table('app_private','staff','staff exists');
select has_table('app_private','vehicles','vehicles exist');
select has_table('app_private','clients','clients exist');
select has_table('app_private','client_contacts','client contacts exist');
select has_table('app_private','service_addresses','service addresses exist');
select has_table('app_private','client_services','client services exist');
select has_table('app_private','service_configurations','service configurations exist');
select has_table('app_private','external_references','external references exist');
select has_table('app_private','business_audit_facts','business audit facts exist');
select has_table('app_private','territory_eligible_teams','territory team eligibility exists');
select has_table('app_private','vehicle_tracking_devices','tracking association foundation exists');

select has_function('api','create_client',array['uuid','text','text','uuid','jsonb'],'client create command exists');
select has_function('api','update_client',array['uuid','uuid','uuid','jsonb'],'client update command exists');
select has_function('api','create_service_address',array['uuid','uuid','jsonb'],'address create command exists');
select has_function('api','configure_service',array['uuid','uuid','jsonb'],'service configuration command exists');
select has_function('api','set_vehicle_availability',array['uuid','uuid','uuid','text'],'vehicle availability command exists');

insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
 ('61000000-0000-0000-0000-000000000001','admin@phase1a.test','{}','{}'),
 ('61000000-0000-0000-0000-000000000002','region-a@phase1a.test','{}','{}'),
 ('61000000-0000-0000-0000-000000000003','driver@phase1a.test','{}','{}');
insert into public.user_profiles(user_id,display_name) values
 ('61000000-0000-0000-0000-000000000001','Phase 1A Admin'),
 ('61000000-0000-0000-0000-000000000002','Phase 1A Region User'),
 ('61000000-0000-0000-0000-000000000003','Phase 1A Driver');
insert into app_private.user_roles(user_id,role_id)
select '61000000-0000-0000-0000-000000000001'::uuid,role_id from app_private.roles where role_key='director_admin'
union all select '61000000-0000-0000-0000-000000000002'::uuid,role_id from app_private.roles where role_key='office_admin'
union all select '61000000-0000-0000-0000-000000000003'::uuid,role_id from app_private.roles where role_key='driver_team';
insert into app_private.user_access_scopes(user_id,scope_kind,scope_id) values
 ('61000000-0000-0000-0000-000000000001','global',null),
 ('61000000-0000-0000-0000-000000000002','service_region','62000000-0000-0000-0000-000000000001'),
 ('61000000-0000-0000-0000-000000000003','service_region','62000000-0000-0000-0000-000000000001');

insert into app_private.service_regions(service_region_id,name,region_code) values
 ('62000000-0000-0000-0000-000000000001','Region A','REG-A'),
 ('62000000-0000-0000-0000-000000000002','Region B','REG-B');
insert into app_private.depots(depot_id,service_region_id,name,address_line_1,suburb,city) values
 ('63000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','Depot A','1 A Road','A','A City'),
 ('63000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000002','Depot B','1 B Road','B','B City');
insert into app_private.teams(team_id,service_region_id,default_depot_id,team_code,name) values
 ('64000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000001','A-TEAM','A Team');
insert into app_private.vehicles(vehicle_id,service_region_id,default_depot_id,default_team_id,registration_reference,display_name,estimated_drum_capacity) values
 ('65000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000001','PHASE1A','Phase 1A Vehicle',40);

select lives_ok($$
 select api.create_client('61000000-0000-0000-0000-000000000001','client-one','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 '66000000-0000-0000-0000-000000000001','{"clientId":"67000000-0000-0000-0000-000000000001","clientType":"individual","displayName":"Client One"}')
$$,'a synthetic client can be created through the application boundary');

select is((select count(*) from app_private.clients where client_id='67000000-0000-0000-0000-000000000001'),1::bigint,'client creation is authoritative');

select is((api.create_client('61000000-0000-0000-0000-000000000001','client-one','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 '66000000-0000-0000-0000-000000000001','{"clientId":"67000000-0000-0000-0000-000000000001","clientType":"individual","displayName":"Client One"}')->>'duplicate')::boolean,true,'client creation is idempotent');

select lives_ok($$ select api.create_client('61000000-0000-0000-0000-000000000001','client-two','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 '66000000-0000-0000-0000-000000000002','{"clientId":"67000000-0000-0000-0000-000000000002","clientType":"individual","displayName":"Client Two"}') $$,'a second client can be created');

select lives_ok($$ select api.create_service_address('61000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000003',
 '{"serviceAddressId":"68000000-0000-0000-0000-000000000001","addressLine1":"10 Shared Street","suburb":"Shared","city":"Pretoria","latitude":-25.7,"longitude":28.2}') $$,'one physical address can be created independently');

select lives_ok($$
 select api.create_client_service('61000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000004',
 '{"clientServiceId":"69000000-0000-0000-0000-000000000001","clientId":"67000000-0000-0000-0000-000000000001","serviceAddressId":"68000000-0000-0000-0000-000000000001","serviceStartDate":"2026-01-01"}');
 select api.create_client_service('61000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000005',
 '{"clientServiceId":"69000000-0000-0000-0000-000000000002","clientId":"67000000-0000-0000-0000-000000000001","serviceAddressId":"68000000-0000-0000-0000-000000000001","serviceStartDate":"2026-01-01"}');
 select api.create_client_service('61000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000006',
 '{"clientServiceId":"69000000-0000-0000-0000-000000000003","clientId":"67000000-0000-0000-0000-000000000002","serviceAddressId":"68000000-0000-0000-0000-000000000001","serviceStartDate":"2026-01-01"}');
$$,'one client can have two services and two clients can share an address');

select is((select count(distinct client_id) from app_private.client_services where service_address_id='68000000-0000-0000-0000-000000000001'),2::bigint,'two clients share one immutable address ID');

select lives_ok($$ select api.update_service_address('61000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000007','{"addressLine1":"12 Changed Street"}') $$,'address text can change');

select is((select service_address_id from app_private.service_addresses where address_line_1='12 Changed Street'),'68000000-0000-0000-0000-000000000001'::uuid,'address identity remains stable after change');

insert into app_private.territories(territory_id,service_region_id,name,priority,default_depot_id,boundary) values
 ('70000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','Overlap Low',10,'63000000-0000-0000-0000-000000000001',extensions.st_multi(extensions.st_geomfromtext('POLYGON((28 -26,29 -26,29 -25,28 -25,28 -26))',4326))),
 ('70000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000001','Overlap High',20,'63000000-0000-0000-0000-000000000001',extensions.st_multi(extensions.st_geomfromtext('POLYGON((28.5 -25.8,29.5 -25.8,29.5 -24.8,28.5 -24.8,28.5 -25.8))',4326)));
select ok((select extensions.st_intersects(a.boundary,b.boundary) from app_private.territories a cross join app_private.territories b where a.territory_id='70000000-0000-0000-0000-000000000001' and b.territory_id='70000000-0000-0000-0000-000000000002'),'overlapping territories are representable');

insert into app_private.service_configurations(client_service_id,service_region_id,territory_id,territory_is_override,depot_id,default_team_id,configured_drum_count,operational_drum_unit_count,configured_collection_day,effective_from) values
 ('69000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002',true,'63000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000001',2,2,1,current_date),
 ('69000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',false,'63000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000001',1,1,3,current_date),
 ('69000000-0000-0000-0000-000000000003','62000000-0000-0000-0000-000000000002',null,false,'63000000-0000-0000-0000-000000000002',null,1,1,5,current_date);
select ok((select territory_is_override from app_private.service_configurations where client_service_id='69000000-0000-0000-0000-000000000001'),'permanent territory overrides are explicit');

select throws_ok($$ insert into app_private.service_configurations(client_service_id,service_region_id,configured_drum_count,operational_drum_unit_count,effective_from) values('69000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001',0,0,current_date+1) $$,'23514',null,'invalid drum counts are rejected');

select lives_ok($$ select api.set_vehicle_availability('61000000-0000-0000-0000-000000000001','65000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000008','maintenance') $$,'vehicle availability can transition through its owner');

select lives_ok($$ select api.archive_client('61000000-0000-0000-0000-000000000001','67000000-0000-0000-0000-000000000001','66000000-0000-0000-0000-000000000009') $$,'client archival is a soft lifecycle change');

select is((select count(*) from app_private.client_services where client_id='67000000-0000-0000-0000-000000000001'),2::bigint,'archiving a client preserves service history references');

insert into app_private.external_references(source_system,entity_type,internal_entity_id,external_identifier) values('website','client','67000000-0000-0000-0000-000000000001','signup-1');
select throws_ok($$ insert into app_private.external_references(source_system,entity_type,internal_entity_id,external_identifier) values('website','client','67000000-0000-0000-0000-000000000002','signup-1') $$,'23505',null,'active external references are unique within source and entity scope');

select ok((select count(*)>=6 from app_private.business_audit_facts),'application commands create audit facts');
select ok((select count(*)>=5 from app_private.outbox_events where event_name like 'Clients.%' or event_name like 'ServiceAddresses.%' or event_name like 'Vehicles.%'),'implemented workflows emit durable domain events');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"61000000-0000-0000-0000-000000000002"}',true);
select is((select count(*) from app_private.service_regions),1::bigint,'region-scoped office access denies the other region');
select is((select count(*) from app_private.clients),1::bigint,'region-scoped client access excludes clients served only in another region');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"61000000-0000-0000-0000-000000000003"}',true);
select is((select count(*) from app_private.clients),0::bigint,'Driver/Team cannot read master client data');
reset role;

select * from finish();
rollback;
