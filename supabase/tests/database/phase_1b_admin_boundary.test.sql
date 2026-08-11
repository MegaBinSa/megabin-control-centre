begin;
select plan(12);

select has_function('api','office_user_context',array['uuid'],'Office profile boundary exists');
select has_function('api','master_data_list',array['uuid','text','jsonb'],'list boundary exists');
select has_function('api','master_data_get',array['uuid','text','uuid'],'get boundary exists');
select has_function('api','master_data_create',array['uuid','text','uuid','jsonb','text','text','uuid'],'create boundary exists');
select has_function('api','master_data_update',array['uuid','text','uuid','jsonb','text','text','uuid'],'update boundary exists');
select has_function('api','master_data_archive',array['uuid','text','uuid','jsonb','text','text','uuid'],'archive boundary exists');

insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
 ('81000000-0000-4000-8000-000000000001','admin@phase1b.test','{}','{}'),
 ('81000000-0000-4000-8000-000000000002','driver@phase1b.test','{}','{}');
insert into public.user_profiles(user_id,display_name) values
 ('81000000-0000-4000-8000-000000000001','Phase 1B Admin'),
 ('81000000-0000-4000-8000-000000000002','Phase 1B Driver');
insert into app_private.user_roles(user_id,role_id)
select '81000000-0000-4000-8000-000000000001'::uuid,role_id from app_private.roles where role_key='director_admin'
union all select '81000000-0000-4000-8000-000000000002'::uuid,role_id from app_private.roles where role_key='driver_team';
insert into app_private.user_access_scopes(user_id,scope_kind) values ('81000000-0000-4000-8000-000000000001','global');

select is(api.office_user_context('81000000-0000-4000-8000-000000000001')->>'display_name','Phase 1B Admin','profile uses application-controlled identity');
select lives_ok($$ select api.master_data_create('81000000-0000-4000-8000-000000000001','clients',null,
  '{"client_type":"individual","display_name":"Synthetic Phase 1B"}','create-one','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','82000000-0000-4000-8000-000000000001') $$,'authorized client create succeeds');
select is((select count(*) from app_private.clients where display_name='Synthetic Phase 1B'),1::bigint,'client persisted once');
select lives_ok($$ select api.master_data_create('81000000-0000-4000-8000-000000000001','clients',null,
  '{"client_type":"individual","display_name":"Synthetic Phase 1B"}','create-one','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','82000000-0000-4000-8000-000000000001') $$,'same idempotent create returns stored result');
select throws_ok($$ select api.master_data_list('81000000-0000-4000-8000-000000000002','clients','{}') $$,'42501',null,'Driver Team is denied');
select ok((select count(*)=1 from app_private.outbox_events where event_name='Clients.ClientCreated' and payload->>'clientId' is not null),'client create emits one durable event');

select * from finish();
rollback;
