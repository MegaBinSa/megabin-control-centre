begin;
select plan(26);
select has_table('app_private','derived_operational_facts','durable derived facts exist');
select has_table('app_private','needs_attention_items','Needs Attention boundary exists');
select has_table('app_private','live_route_progress','live progress projection exists');
select has_table('app_private','intelligence_processing_checkpoints','incremental checkpoint exists');
select has_function('api','operational_intelligence_apply',array['uuid','uuid','jsonb','jsonb','uuid'],'bounded inference application boundary exists');

insert into auth.users(id,email) values ('71000000-0000-4000-8000-000000000001','intelligence-office@test.invalid'),('71000000-0000-4000-8000-000000000002','intelligence-driver@test.invalid');
insert into public.user_profiles(user_id,display_name) values ('71000000-0000-4000-8000-000000000001','Intelligence Office'),('71000000-0000-4000-8000-000000000002','Intelligence Driver');
insert into app_private.user_roles(user_id,role_id) select '71000000-0000-4000-8000-000000000001'::uuid,role_id from app_private.roles where role_key='operations_manager' union all select '71000000-0000-4000-8000-000000000002'::uuid,role_id from app_private.roles where role_key='driver_team';
insert into app_private.user_access_scopes(user_id,scope_kind,scope_id) values ('71000000-0000-4000-8000-000000000001','service_region','51000000-0000-0000-0000-000000000001'),('71000000-0000-4000-8000-000000000002','team','54000000-0000-0000-0000-000000000001');

create temporary table intelligence_counts(raw_count bigint,operation_count bigint);
insert into intelligence_counts select count(*),(select count(*) from app_private.route_operations) from app_private.vehicle_location_observations;
create temporary table intelligence_signal(value jsonb);
insert into intelligence_signal values(jsonb_build_object('factType','route_deviation','vehicleId','56000000-0000-0000-0000-000000000001','routeOperationId','','routeOperationStopId','','serviceRegionId','51000000-0000-0000-0000-000000000001','detectedAt','2026-08-12T10:00:00Z','evidenceFrom','2026-08-12T09:58:00Z','evidenceTo','2026-08-12T10:00:00Z','confidence','high','severity','warning','deduplicationKey','vehicle-1:deviation','ruleVersion','phase-3c-v1','sourceRouteVersionId','','sourceManifestRevision','','summary','Sustained route corridor deviation','evidence',jsonb_build_object('consecutiveObservations',3,'corridorDistancesMetres',jsonb_build_array(300,320,340)),'firstObservationId','','lastObservationId',''));

select throws_ok($$select api.operational_intelligence_apply('71000000-0000-4000-8000-000000000001','51000000-0000-0000-0000-000000000001',jsonb_build_array(jsonb_set((select value from intelligence_signal),'{vehicleId}',to_jsonb(gen_random_uuid()::text))),null,'72000000-0000-4000-8000-000000000010')$$,'22023','signal_vehicle_mismatch','normalized signals are checked against authoritative vehicle region');

select is((api.operational_intelligence_apply('71000000-0000-4000-8000-000000000001','51000000-0000-0000-0000-000000000001',jsonb_build_array((select value from intelligence_signal)),null,'72000000-0000-4000-8000-000000000001')->>'processedSignals')::integer,1,'signal batch applied');
select is((select count(*) from app_private.derived_operational_facts),1::bigint,'derived fact created once');
select is((select confidence from app_private.derived_operational_facts),'high','confidence preserved');
select is((select evidence->>'consecutiveObservations' from app_private.derived_operational_facts),'3','concise evidence preserved');
select is((select count(*) from app_private.needs_attention_items),1::bigint,'Needs Attention item created');
select lives_ok($$select api.operational_intelligence_apply('71000000-0000-4000-8000-000000000001','51000000-0000-0000-0000-000000000001',jsonb_build_array((select value from intelligence_signal)),null,'72000000-0000-4000-8000-000000000002')$$,'continuous fact reprocessing succeeds');
select is((select count(*) from app_private.derived_operational_facts),1::bigint,'continuous deviation deduplicates');
select is((select count(*) from app_private.needs_attention_items),1::bigint,'Needs Attention deduplicates');
select is(jsonb_array_length(api.operational_facts_list('71000000-0000-4000-8000-000000000001','51000000-0000-0000-0000-000000000001','open')),1,'regional Office lists open facts');
select is(jsonb_array_length(api.needs_attention_list('71000000-0000-4000-8000-000000000001','51000000-0000-0000-0000-000000000001','open')),1,'regional Office lists Needs Attention');
select is((api.operational_fact_review('71000000-0000-4000-8000-000000000001',(select operational_fact_id from app_private.derived_operational_facts),'acknowledge',null,'72000000-0000-4000-8000-000000000003')->>'lifecycle_status'),'acknowledged','fact acknowledged');
select is((select lifecycle_status from app_private.needs_attention_items),'acknowledged','Needs Attention follows acknowledgement');
select is((api.operational_fact_review('71000000-0000-4000-8000-000000000001',(select operational_fact_id from app_private.derived_operational_facts),'dismiss','Synthetic false positive','72000000-0000-4000-8000-000000000004')->>'lifecycle_status'),'dismissed','false positive dismissed with reason');
select is((select count(*) from app_private.business_audit_facts where module_key='operational-intelligence'),2::bigint,'human review actions audited');
select ok((select count(*)>=3 from app_private.outbox_events where producer_module in ('operational-intelligence','needs-attention')),'low-volume lifecycle events use outbox');
select is((select count(*) from app_private.vehicle_location_observations),(select raw_count from intelligence_counts),'raw GPS remains unchanged');
select is((select count(*) from app_private.route_operations),(select operation_count from intelligence_counts),'Route Operations truth remains unchanged');
select throws_ok($$select api.operational_facts_list('71000000-0000-4000-8000-000000000001',gen_random_uuid(),null)$$,'42501',null,'cross-region intelligence read denied');
select throws_ok($$select api.operational_facts_list('71000000-0000-4000-8000-000000000002','51000000-0000-0000-0000-000000000001',null)$$,'42501',null,'Driver all-fleet intelligence denied');
select throws_ok($$set local role authenticated; select * from app_private.derived_operational_facts$$,'42501',null,'raw derived-fact browser table denied');
select * from finish(); rollback;
