begin;
select plan(19);

select has_column('app_private','accounting_sync_runs','idempotency_key','sync runs retain deterministic identities');
select has_function('app_private','provision_synthetic_staging_accounting_operator',array['text','uuid'],'bounded accounting operator provisioner exists');

insert into auth.users(id,email,email_confirmed_at)
values('7f000000-0000-4000-8000-000000000001','staging-accounting@megabin.local',now());
select lives_ok($$select app_private.provision_synthetic_staging_accounting_operator('staging-accounting@megabin.local',gen_random_uuid())$$,'approved accounting operator provisions');
select is((select display_name from public.user_profiles where user_id='7f000000-0000-4000-8000-000000000001'),'Synthetic Staging Accounting Operator','operator profile is deterministic');
select ok(app_private.user_has_global_permission('7f000000-0000-4000-8000-000000000001','accounting.sync'),'operator has legitimate global sync authority');
select throws_ok($$select app_private.provision_synthetic_staging_accounting_operator('other@megabin.local',gen_random_uuid())$$,'22023','staging_accounting_identity_not_allowed','arbitrary accounting identity is rejected');

create temporary table fin_sync_ids(first_id uuid, second_id uuid);
with result as (
  select api.accounting_start_sync(
    '7f000000-0000-4000-8000-000000000001',
    '{"provider":"zoho-books-fake","environment":"local","organizationId":"local-synthetic","syncMode":"initial_full","idempotencyKey":"uat:accounting:UAT-FIN-001:fake-sync:01"}',
    '7f000000-0000-4000-8000-000000000002'
  ) value
)
insert into fin_sync_ids(first_id) select(value->>'syncRunId')::uuid from result;
select is((select lifecycle_status from app_private.accounting_sync_runs where accounting_sync_run_id=(select first_id from fin_sync_ids)),'pending','first synchronization is pending');
select is((api.accounting_start_sync('7f000000-0000-4000-8000-000000000001','{"provider":"zoho-books-fake","environment":"local","organizationId":"local-synthetic","syncMode":"initial_full","idempotencyKey":"uat:accounting:UAT-FIN-001:fake-sync:01"}','7f000000-0000-4000-8000-000000000003')->>'duplicate')::boolean,true,'exact retry resolves as duplicate');
update fin_sync_ids set second_id=(api.accounting_start_sync('7f000000-0000-4000-8000-000000000001','{"provider":"zoho-books-fake","environment":"local","organizationId":"local-synthetic","syncMode":"initial_full","idempotencyKey":"uat:accounting:UAT-FIN-001:fake-sync:01"}','7f000000-0000-4000-8000-000000000004')->>'syncRunId')::uuid;
select is((select second_id from fin_sync_ids),(select first_id from fin_sync_ids),'exact retry returns the original run');
select is((select count(*) from app_private.accounting_sync_runs where idempotency_key='uat:accounting:UAT-FIN-001:fake-sync:01'),1::bigint,'exact retry creates one run');
select throws_ok($$select api.accounting_start_sync('7f000000-0000-4000-8000-000000000001','{"provider":"zoho-books-fake","environment":"local","organizationId":"local-synthetic","syncMode":"incremental","idempotencyKey":"uat:accounting:UAT-FIN-001:fake-sync:01"}','7f000000-0000-4000-8000-000000000005')$$,'22023','accounting_sync_idempotency_conflict','conflicting reuse fails closed');
select lives_ok(format($f$select api.accounting_ingest_sync(%L,'{"customers":[],"invoices":[],"payments":[],"adjustments":[],"providerMetadata":{"synthetic":true}}')$f$,(select first_id from fin_sync_ids)),'the original run can complete normally');
select is((select lifecycle_status from app_private.accounting_sync_runs where accounting_sync_run_id=(select first_id from fin_sync_ids)),'succeeded','durable run reaches succeeded');
select is((api.accounting_start_sync('7f000000-0000-4000-8000-000000000001','{"provider":"zoho-books-fake","environment":"local","organizationId":"local-synthetic","syncMode":"initial_full","idempotencyKey":"uat:accounting:UAT-FIN-001:fake-sync:01"}','7f000000-0000-4000-8000-000000000006')->>'status'),'succeeded','terminal exact retry returns the durable outcome');
select is((select count(*) from app_private.business_audit_facts where action_key='accounting.sync_started' and target_id=(select first_id from fin_sync_ids)),1::bigint,'exact retry does not duplicate sync audit evidence');
select is((select count(*) from app_private.financial_holds),0::bigint,'fake synchronization creates no financial hold');
select is((select count(*) from app_private.route_operations),0::bigint,'fake synchronization creates no route operation');
select is((select count(*) from app_private.outbox_events where event_name='Accounting.SyncCompleted' and aggregate_id=(select first_id from fin_sync_ids)),1::bigint,'completion emits one event');
select is((select count(*) from app_private.user_roles where user_id='7f000000-0000-4000-8000-000000000001'),1::bigint,'operator receives one bounded role');

select * from finish();
rollback;
