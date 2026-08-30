begin;
select plan(70);

select has_table('app_private','website_intake_submissions','immutable website intake exists');
select has_table('app_private','website_intake_processing_history','processing interpretation history exists');
select has_table('app_private','website_intake_reviews','review history exists');
select has_function('api','website_intake_receive',array['text','text','text','text','uuid','jsonb'],'integration receipt boundary exists');
select has_function('api','website_intake_activate',array['uuid','uuid','integer','uuid'],'activation orchestration boundary exists');

insert into auth.users(id,email) values
 ('74000000-0000-4000-8000-000000000001','intake-office@test.invalid'),
 ('74000000-0000-4000-8000-000000000002','intake-driver@test.invalid'),
 ('74000000-0000-4000-8000-000000000003','intake-other-region@test.invalid'),
 ('74000000-0000-4000-8000-000000000004','intake-regional-office@test.invalid'),
 ('74000000-0000-4000-8000-000000000005','intake-regional-no-activate@test.invalid');
insert into public.user_profiles(user_id,display_name) values
 ('74000000-0000-4000-8000-000000000001','Intake Office'),
 ('74000000-0000-4000-8000-000000000002','Intake Driver'),
 ('74000000-0000-4000-8000-000000000003','Other Region Office'),
 ('74000000-0000-4000-8000-000000000004','Regional Intake Office'),
 ('74000000-0000-4000-8000-000000000005','Regional Master Data Only');
insert into app_private.roles(role_id,role_key,display_name,is_system) values
 ('74000000-0000-4000-8000-000000000105','regional_master_data_only','Regional Master Data Only',false);
insert into app_private.role_permissions(role_id,permission_key) values
 ('74000000-0000-4000-8000-000000000105','master_data.write');
insert into app_private.user_roles(user_id,role_id)
select '74000000-0000-4000-8000-000000000001'::uuid,role_id from app_private.roles where role_key='operations_manager'
union all select '74000000-0000-4000-8000-000000000002'::uuid,role_id from app_private.roles where role_key='driver_team'
union all select '74000000-0000-4000-8000-000000000003'::uuid,role_id from app_private.roles where role_key='operations_manager'
union all select '74000000-0000-4000-8000-000000000004'::uuid,role_id from app_private.roles where role_key='office_admin'
union all select '74000000-0000-4000-8000-000000000005'::uuid,role_id from app_private.roles where role_key='regional_master_data_only';
insert into app_private.user_access_scopes(user_id,scope_kind,scope_id) values
 ('74000000-0000-4000-8000-000000000001','global',null),
 ('74000000-0000-4000-8000-000000000002','team','54000000-0000-0000-0000-000000000001'),
 ('74000000-0000-4000-8000-000000000003','service_region','51000000-0000-0000-0000-000000000099'),
 ('74000000-0000-4000-8000-000000000004','service_region','51000000-0000-0000-0000-000000000001'),
 ('74000000-0000-4000-8000-000000000005','service_region','51000000-0000-0000-0000-000000000001');

create temporary table intake_result(value jsonb);
insert into intake_result select api.website_intake_receive(
 'megabin-website-onboarding-local','web-100','retry-100',repeat('a',64),'75000000-0000-4000-8000-000000000001',
 '{"sourceSubmissionId":"web-100","payloadVersion":"1.0","submittedAt":"2026-08-13T05:00:00Z","client":{"type":"individual","displayName":"Synthetic Web Client"},"contact":{"name":"Synthetic Contact","mobile":"082 123 4567","email":"TEST@EXAMPLE.COM","preferredLanguage":"english"},"address":{"addressLine1":"100 Synthetic Lane","suburb":"Test Suburb","city":"Pretoria","postalCode":"0001"},"requestedDrumCount":2,"requestedStartDate":"2026-08-20","references":{"customerReference":"customer-100","serviceReference":"service-100"}}'
);
select is((select value->>'acknowledgement' from intake_result),'accepted','valid submission accepted');
select is((select lifecycle_status from app_private.website_intake_submissions where source_submission_id='web-100'),'received','receipt does not activate master data');
select is((api.website_intake_receive('megabin-website-onboarding-local','web-100','retry-100',repeat('a',64),'75000000-0000-4000-8000-000000000002',(select source_payload from app_private.website_intake_submissions where source_submission_id='web-100'))->>'acknowledgement'),'duplicate','exact retry returns prior result');
select is((select count(*) from app_private.website_intake_submissions where source_submission_id='web-100'),1::bigint,'transport retry creates one submission');
select throws_ok($$select api.website_intake_receive('megabin-website-onboarding-local','web-100','retry-100',repeat('b',64),gen_random_uuid(),'{}')$$,'23505','changed_payload_conflict','changed repeat is conflict');

select lives_ok(format('select api.website_intake_process(%L,%L)',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-100'),'75000000-0000-4000-8000-000000000003'),'async processing completes');
select is((select normalized_data->>'mobileE164' from app_private.website_intake_submissions where source_submission_id='web-100'),'+27821234567','South African phone normalized');
select is((select normalized_data->>'email' from app_private.website_intake_submissions where source_submission_id='web-100'),'test@example.com','email normalized');
select is((select lifecycle_status from app_private.website_intake_submissions where source_submission_id='web-100'),'needs_review','conservative posture requires Office review');
select is((select decision->'clientMatch'->>'status' from app_private.website_intake_submissions where source_submission_id='web-100'),'no_match','new client candidate explained');
select is((select decision->'addressMatch'->>'status' from app_private.website_intake_submissions where source_submission_id='web-100'),'no_match','new address candidate explained');
select is((select count(*) from app_private.website_intake_processing_history),1::bigint,'processing interpretation retained');

insert into app_private.client_contacts(client_id,contact_name,mobile_e164,email,is_primary) values
 ('57000000-0000-0000-0000-000000000001','Existing Synthetic','+27825550101','existing@example.test',true);
select lives_ok($$select api.website_intake_receive('megabin-website-onboarding-local','web-200','retry-200',repeat('c',64),gen_random_uuid(),'{"sourceSubmissionId":"web-200","payloadVersion":"1.0","submittedAt":"2026-08-13T05:01:00Z","client":{"type":"individual","displayName":"Existing Synthetic"},"contact":{"name":"Existing Synthetic","mobile":"0825550101"},"address":{"addressLine1":"200 New Service Road","suburb":"New Suburb","city":"Pretoria"},"requestedDrumCount":1}')$$,'existing-client submission received');
select lives_ok(format('select api.website_intake_process(%L,gen_random_uuid())',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-200')),'existing-client submission processed');
select is((select decision->'clientMatch'->>'status' from app_private.website_intake_submissions where source_submission_id='web-200'),'strong_match','existing Client/new Address candidate detected');
select is((select decision->'addressMatch'->>'status' from app_private.website_intake_submissions where source_submission_id='web-200'),'no_match','existing Client retains new Address choice');

select lives_ok($$select api.website_intake_receive('megabin-website-onboarding-local','web-201','retry-201',repeat('d',64),gen_random_uuid(),'{"sourceSubmissionId":"web-201","payloadVersion":"1.0","submittedAt":"2026-08-13T05:02:00Z","client":{"type":"individual","displayName":"New Shared Address Client"},"contact":{"name":"New Shared Address Client","mobile":"0825550202"},"address":{"addressLine1":"10 Shared Test Street","suburb":"Test Suburb","city":"Pretoria","latitude":-25.70,"longitude":28.27},"requestedDrumCount":1}')$$,'new-client existing-address submission received');
select lives_ok(format('select api.website_intake_process(%L,gen_random_uuid())',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-201')),'new-client existing-address submission processed');
select is((select decision->'addressMatch'->>'status' from app_private.website_intake_submissions where source_submission_id='web-201'),'strong_match','new Client/existing Address candidate detected');
select is((select jsonb_array_length(decision->'geography'->'territories') from app_private.website_intake_submissions where source_submission_id='web-201'),2,'ambiguous territory candidates are retained for review');
select is((select count(*) from app_private.client_services where service_address_id='58000000-0000-0000-0000-000000000001'),3::bigint,'multiple Clients and Services at one Address remain supported');

select throws_ok(format('select api.website_intake_detail(%L,%L)','74000000-0000-4000-8000-000000000002',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-100')),'42501',null,'Driver cannot access intake');
select throws_ok(format('select api.website_intake_detail(%L,%L)','74000000-0000-4000-8000-000000000003',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-100')),'42501',null,'cross-region Office denied after region known');
select lives_ok($$select api.website_intake_list('74000000-0000-4000-8000-000000000004','{"serviceRegionId":"51000000-0000-0000-0000-000000000001"}')$$,'region-scoped Office can list Website Intake in its region');
select throws_ok($$select api.website_intake_list('74000000-0000-4000-8000-000000000004','{}')$$,'42501',null,'region-scoped Office cannot request an unscoped Website Intake list');
select throws_ok($$select api.website_intake_list('74000000-0000-4000-8000-000000000004','{"serviceRegionId":"51000000-0000-0000-0000-000000000099"}')$$,'42501',null,'region-scoped Office cannot list Website Intake in another region');
select throws_ok($$set local role authenticated; select * from app_private.website_intake_submissions$$,'42501',null,'browser cannot read raw intake table');

select lives_ok(format($f$select api.website_intake_review(%L,%L,'approve',2,%L::jsonb,null,%L)$f$,
 '74000000-0000-4000-8000-000000000001',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-100'),
 '{"approvedDrumCount":2,"serviceRegionId":"51000000-0000-0000-0000-000000000001","territoryId":"53000000-0000-0000-0000-000000000001","depotId":"52000000-0000-0000-0000-000000000001","defaultTeamId":"54000000-0000-0000-0000-000000000001","collectionDay":1,"effectiveStartDate":"2026-08-20"}','75000000-0000-4000-8000-000000000004'),'approval freezes activation decision');
select is((select approved_decision->>'approvedDrumCount' from app_private.website_intake_submissions where source_submission_id='web-100'),'2','approved drum count retained separately');
select throws_ok(format($f$select api.website_intake_review(%L,%L,'reject',2,null,'stale',%L)$f$,'74000000-0000-4000-8000-000000000001',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-100'),'75000000-0000-4000-8000-000000000005'),'40001','stale_review','stale review conflicts');

select lives_ok(format('select api.website_intake_activate(%L,%L,3,%L)','74000000-0000-4000-8000-000000000001',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-100'),'75000000-0000-4000-8000-000000000006'),'approved intake activates transactionally');
select is((select lifecycle_status from app_private.website_intake_submissions where source_submission_id='web-100'),'activated','intake reaches activated state');
select is((select count(*) from app_private.clients where display_name='Synthetic Web Client'),1::bigint,'authoritative Client created once');
select is((select count(*) from app_private.service_addresses where address_line_1='100 Synthetic Lane'),1::bigint,'authoritative address created once');
select is((select count(*) from app_private.client_services cs join app_private.clients c on c.client_id=cs.client_id where c.display_name='Synthetic Web Client'),1::bigint,'authoritative service created once');
select is((select count(*) from app_private.service_configurations sc join app_private.client_services cs on cs.client_service_id=sc.client_service_id join app_private.clients c on c.client_id=cs.client_id where c.display_name='Synthetic Web Client'),1::bigint,'approved configuration created once');
select is((select count(*) from app_private.external_references where source_system='megabin_website' and external_identifier in ('web-100','customer-100','service-100')),3::bigint,'external references linked');
select is((api.website_intake_activate('74000000-0000-4000-8000-000000000001',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-100'),4,'75000000-0000-4000-8000-000000000007')->>'duplicate')::boolean,true,'repeated activation is idempotent');
select is((select count(*) from app_private.clients where display_name='Synthetic Web Client'),1::bigint,'repeat activation creates no duplicate client');
select is(api.website_intake_source_status('megabin-website-onboarding-local','web-100')->>'status','activated','source receives narrow safe status');
select ok((select count(*)>=3 from app_private.outbox_events where producer_module='website-intake'),'concise lifecycle events emitted');
select ok((select count(*)>=2 from app_private.business_audit_facts where module_key='website-intake'),'business actions audited');
select ok((select count(*)>=3 from app_private.integration_activity_logs where safe_metadata ? 'validationStatus' or safe_metadata->>'classification'='transport_retry'),'safe integration receipt metrics recorded');

-- A region-scoped Office activation reuses private master-data owner primitives;
-- the ordinary unscoped APIs remain global-only.
select lives_ok($$select api.website_intake_receive(
  'megabin-website-onboarding-local','web-regional','retry-regional',repeat('e',64),gen_random_uuid(),
  '{"sourceSubmissionId":"web-regional","payloadVersion":"1.0","submittedAt":"2026-08-30T08:00:00Z","client":{"type":"individual","displayName":"Regional Website Client"},"contact":{"name":"Regional Website Contact","mobile":"0820000201","email":"regional-website@example.test"},"address":{"addressLine1":"201 Regional Website Road","suburb":"Synthetic North","city":"Pretoria","postalCode":"0001","latitude":-25.70,"longitude":28.22},"requestedDrumCount":2,"requestedStartDate":"2026-09-01","references":{"customerReference":"regional-customer","serviceReference":"regional-service"}}'
)$$,'regional intake received');
select lives_ok(format('select api.website_intake_process(%L,gen_random_uuid())',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-regional')),'regional intake processed');
select lives_ok(format($f$select api.website_intake_review(%L,%L,'approve',2,%L::jsonb,'Regional UAT approval',gen_random_uuid())$f$,
 '74000000-0000-4000-8000-000000000004',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-regional'),
 '{"approvedDrumCount":2,"serviceRegionId":"51000000-0000-0000-0000-000000000001","territoryId":"53000000-0000-0000-0000-000000000001","depotId":"52000000-0000-0000-0000-000000000001","defaultTeamId":"54000000-0000-0000-0000-000000000001","collectionDay":1,"effectiveStartDate":"2026-09-01"}'),'regional intake approved');
select throws_ok(format('select api.website_intake_activate(%L,%L,3,gen_random_uuid())','74000000-0000-4000-8000-000000000003',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-regional')),'42501',null,'cross-region Office cannot activate Pretoria intake');
select throws_ok(format('select api.website_intake_activate(%L,%L,3,gen_random_uuid())','74000000-0000-4000-8000-000000000005',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-regional')),'42501',null,'regional master-data actor without website activation permission is denied');
select lives_ok(format('select api.website_intake_activate(%L,%L,3,gen_random_uuid())','74000000-0000-4000-8000-000000000004',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-regional')),'Pretoria-scoped Office activates approved Pretoria intake');
select is((select lifecycle_status from app_private.website_intake_submissions where source_submission_id='web-regional'),'activated','regional intake is activated');
select is((select count(*) from app_private.clients where display_name='Regional Website Client'),1::bigint,'regional activation creates one Client');
select is((select count(*) from app_private.client_contacts where email='regional-website@example.test'),1::bigint,'regional activation creates one Contact');
select is((select count(*) from app_private.service_addresses where address_line_1='201 Regional Website Road'),1::bigint,'regional activation creates one Address');
select is((select count(*) from app_private.client_services cs join app_private.clients c using(client_id) where c.display_name='Regional Website Client'),1::bigint,'regional activation creates one Client Service');
select is((select count(*) from app_private.service_configurations sc join app_private.client_services cs using(client_service_id) join app_private.clients c using(client_id) where c.display_name='Regional Website Client' and sc.service_region_id='51000000-0000-0000-0000-000000000001'),1::bigint,'regional activation creates one Pretoria configuration');
select is((api.website_intake_activate('74000000-0000-4000-8000-000000000004',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-regional'),4,gen_random_uuid())->>'duplicate')::boolean,true,'regional duplicate activation returns existing result');
select is((select count(*) from app_private.clients where display_name='Regional Website Client'),1::bigint,'regional duplicate creates no second Client');
select throws_ok($$select api.create_client('74000000-0000-4000-8000-000000000004','regional-generic-denied',repeat('f',64),gen_random_uuid(),'{"clientType":"individual","displayName":"Forbidden Generic Regional Client"}')$$,'42501',null,'ordinary unscoped Client creation remains global-only');

select lives_ok($$select api.website_intake_receive(
  'megabin-website-onboarding-local','web-rollback','retry-rollback',repeat('1',64),gen_random_uuid(),
  '{"sourceSubmissionId":"web-rollback","payloadVersion":"1.0","submittedAt":"2026-08-30T08:10:00Z","client":{"type":"individual","displayName":"Rollback Website Client"},"contact":{"name":"Rollback Website Contact","mobile":"0820000202","email":"rollback-website@example.test"},"address":{"addressLine1":"202 Rollback Website Road","suburb":"Synthetic North","city":"Pretoria","postalCode":"0001","latitude":-25.70,"longitude":28.22},"requestedDrumCount":2,"requestedStartDate":"2026-09-01"}'
)$$,'rollback intake received');
select lives_ok(format('select api.website_intake_process(%L,gen_random_uuid())',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-rollback')),'rollback intake processed');
select lives_ok(format($f$select api.website_intake_review(%L,%L,'approve',2,%L::jsonb,'Rollback proof',gen_random_uuid())$f$,
 '74000000-0000-4000-8000-000000000004',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-rollback'),
 '{"approvedDrumCount":0,"serviceRegionId":"51000000-0000-0000-0000-000000000001","territoryId":"53000000-0000-0000-0000-000000000001","depotId":"52000000-0000-0000-0000-000000000001","defaultTeamId":"54000000-0000-0000-0000-000000000001","collectionDay":1,"effectiveStartDate":"2026-09-01"}'),'rollback intake approved with a deliberately invalid downstream invariant');
select throws_ok(format('select api.website_intake_activate(%L,%L,3,gen_random_uuid())','74000000-0000-4000-8000-000000000004',(select website_intake_submission_id from app_private.website_intake_submissions where source_submission_id='web-rollback')),'23514',null,'late configuration failure aborts activation');
select is((select lifecycle_status from app_private.website_intake_submissions where source_submission_id='web-rollback'),'approved','failed activation rolls intake back to approved');
select is((select count(*) from app_private.clients where display_name='Rollback Website Client'),0::bigint,'failed activation rolls back Client');
select is((select count(*) from app_private.service_addresses where address_line_1='202 Rollback Website Road'),0::bigint,'failed activation rolls back Address');

select * from finish();
rollback;
