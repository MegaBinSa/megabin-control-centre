begin;
select plan(18);

insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
values ('8f000000-0000-4000-8000-000000000001','office-lifecycle@example.invalid','{}','{}');

insert into public.user_profiles(user_id,display_name)
values ('8f000000-0000-4000-8000-000000000001','Lifecycle Regression Office');

insert into app_private.user_roles(user_id,role_id)
select '8f000000-0000-4000-8000-000000000001', role_id
from app_private.roles
where role_key='office_admin';

insert into app_private.user_access_scopes(user_id,scope_kind,scope_id)
values (
  '8f000000-0000-4000-8000-000000000001',
  'service_region',
  '51000000-0000-0000-0000-000000000001'
);

select ok(
  app_private.user_has_region_permission(
    '8f000000-0000-4000-8000-000000000001',
    'master_data.write',
    '51000000-0000-0000-0000-000000000001'
  ),
  'Office actor has region-scoped master-data write permission'
);
select isnt(
  app_private.user_has_global_permission(
    '8f000000-0000-4000-8000-000000000001',
    'master_data.write'
  ),
  true,
  'Office actor does not receive global master-data write permission'
);

create temporary table lifecycle_clock(client_updated_at timestamptz,service_updated_at timestamptz);
insert into lifecycle_clock
select
  (select updated_at from app_private.clients where client_id='57000000-0000-0000-0000-000000000001'),
  (select updated_at from app_private.client_services where client_service_id='59000000-0000-0000-0000-000000000001');

select lives_ok(
  $$select api.master_data_update(
    '8f000000-0000-4000-8000-000000000001',
    'clients',
    '57000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'lifecycle_status','active',
      'expected_updated_at',(select client_updated_at from lifecycle_clock)
    ),
    'activate-synthetic-client-one',
    repeat('a',64),
    '8f000000-0000-4000-8000-000000000002'
  )$$,
  'region-scoped Office actor activates seeded Synthetic Client One'
);
select is(
  (select lifecycle_status from app_private.clients where client_id='57000000-0000-0000-0000-000000000001'),
  'active',
  'client lifecycle is authoritatively persisted'
);
select ok(
  (select activated_at is not null from app_private.clients where client_id='57000000-0000-0000-0000-000000000001'),
  'client activation timestamp satisfies the lifecycle invariant'
);
select is(
  (select organisation_name from app_private.clients where client_id='57000000-0000-0000-0000-000000000001'),
  null::text,
  'nullable organisation name remains unchanged'
);
select is(
  (select count(*) from app_private.business_audit_facts where action_key='clients.updated' and target_id='57000000-0000-0000-0000-000000000001'),
  1::bigint,
  'client activation records one audit fact'
);
select is(
  (select count(*) from app_private.outbox_events where event_name='Clients.ClientActivated' and aggregate_id='57000000-0000-0000-0000-000000000001'),
  1::bigint,
  'client activation emits one durable event'
);
select is(
  (select payload->>'previousStatus' from app_private.outbox_events where event_name='Clients.ClientActivated' and aggregate_id='57000000-0000-0000-0000-000000000001'),
  'pending',
  'activation event preserves the previous lifecycle status'
);

select lives_ok(
  $$select api.master_data_update(
    '8f000000-0000-4000-8000-000000000001',
    'clients',
    '57000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'lifecycle_status','active',
      'expected_updated_at',(select client_updated_at from lifecycle_clock)
    ),
    'activate-synthetic-client-one',
    repeat('a',64),
    '8f000000-0000-4000-8000-000000000002'
  )$$,
  'exact activation retry returns the stored authoritative result'
);
select is(
  (select count(*) from app_private.business_audit_facts where action_key='clients.updated' and target_id='57000000-0000-0000-0000-000000000001'),
  1::bigint,
  'exact retry does not duplicate the audit fact'
);
select is(
  (select count(*) from app_private.outbox_events where event_name='Clients.ClientActivated' and aggregate_id='57000000-0000-0000-0000-000000000001'),
  1::bigint,
  'exact retry does not duplicate the activation event'
);
select throws_ok(
  $$select api.master_data_update(
    '8f000000-0000-4000-8000-000000000001',
    'clients',
    '57000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'lifecycle_status','on_hold',
      'expected_updated_at',(select client_updated_at from lifecycle_clock)
    ),
    'stale-synthetic-client-one',
    repeat('b',64),
    '8f000000-0000-4000-8000-000000000003'
  )$$,
  '40001',
  null,
  'stale client update remains rejected'
);

select lives_ok(
  $$select api.master_data_update(
    '8f000000-0000-4000-8000-000000000001',
    'client-services',
    '59000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'lifecycle_status','active',
      'expected_updated_at',(select service_updated_at from lifecycle_clock)
    ),
    'activate-synthetic-client-service',
    repeat('c',64),
    '8f000000-0000-4000-8000-000000000004'
  )$$,
  'same region-scoped update boundary activates the seeded Client Service'
);
select is(
  (select lifecycle_status from app_private.client_services where client_service_id='59000000-0000-0000-0000-000000000001'),
  'active',
  'Client Service lifecycle is authoritatively persisted'
);
select is(
  (select service_start_date from app_private.client_services where client_service_id='59000000-0000-0000-0000-000000000001'),
  current_date,
  'Client Service nullable/date fields are not altered by lifecycle activation'
);
select is(
  (select count(*) from app_private.business_audit_facts where action_key='client_services.updated' and target_id='59000000-0000-0000-0000-000000000001'),
  1::bigint,
  'Client Service activation records one audit fact'
);
select is(
  (select count(*) from app_private.outbox_events where aggregate_id='59000000-0000-0000-0000-000000000001' and occurred_at >= transaction_timestamp()),
  0::bigint,
  'Client Service activation does not invent an undocumented lifecycle event'
);

select * from finish();
rollback;
