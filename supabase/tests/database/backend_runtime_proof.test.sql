begin;

select plan(39);

select has_table('app_private', 'synthetic_platform_proofs', 'synthetic proof state exists');
select has_table('app_private', 'technical_audit_facts', 'synthetic technical audit exists');
select has_function('api', 'execute_platform_proof', 'transactional proof function exists');
select has_function('api', 'claim_outbox_events', 'bounded outbox claim function exists');
select has_function('api', 'fail_outbox_event', 'outbox failure function exists');
select has_function('api', 'replay_dead_letter_event', 'dead-letter replay function exists');

select is(
  (
    select count(*) from pg_class
    where oid in (
      'app_private.synthetic_platform_proofs'::regclass,
      'app_private.technical_audit_facts'::regclass
    ) and relrowsecurity
  ),
  2::bigint,
  'synthetic runtime tables use defense-in-depth RLS'
);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values ('80000000-0000-0000-0000-000000000001', 'runtime@example.test', '{}', '{}');

insert into public.user_profiles (user_id, display_name, is_active)
values ('80000000-0000-0000-0000-000000000001', 'Runtime Proof User', true);

insert into app_private.roles (role_id, role_key, display_name, is_system)
values (
  '80000000-0000-0000-0000-000000000002',
  'runtime_proof_operator', 'Runtime Proof Operator', true
);

insert into app_private.role_permissions (role_id, permission_key)
values
  ('80000000-0000-0000-0000-000000000002', 'platform_proof.execute'),
  ('80000000-0000-0000-0000-000000000002', 'platform_proof.replay');

insert into app_private.user_roles (user_id, role_id)
values (
  '80000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000002'
);

insert into app_private.user_access_scopes (user_id, scope_kind)
values ('80000000-0000-0000-0000-000000000001', 'global');

insert into app_private.configuration_values (
  configuration_key, environment_name, configuration_value
)
values ('runtime.proof-enabled', 'local', 'true');

insert into app_private.feature_flag_targets (flag_key, environment_name, enabled)
values ('runtime.platform-proof', 'local', true);

select is(
  api.get_runtime_configuration('local')->>'runtime.proof-enabled',
  'true',
  'runtime configuration loads the local environment override'
);

select is(
  api.get_runtime_feature_flag('runtime.platform-proof')->'targets'->0->>'environment',
  'local',
  'runtime feature flag targets are loadable'
);

select lives_ok(
  $$
    select api.execute_platform_proof(
      '81000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      'runtime-first', repeat('a', 64),
      '82000000-0000-0000-0000-000000000001',
      'first proof', false
    )
  $$,
  'the authorized synthetic command commits successfully'
);

select is(
  (select count(*) from app_private.synthetic_platform_proofs),
  1::bigint,
  'one synthetic state effect commits'
);
select is(
  (select count(*) from app_private.technical_audit_facts where action_key = 'platform_proof.executed'),
  1::bigint,
  'one synthetic audit fact commits'
);
select is(
  (select count(*) from app_private.outbox_events where event_name = 'Platform.ProofRecorded'),
  1::bigint,
  'one outbox event commits in the same transaction'
);
select is(
  (
    select processing_status from app_private.idempotency_records
    where operation_key = 'platform.proof.execute' and idempotency_key = 'runtime-first'
  ),
  'completed',
  'the idempotency result commits with the effect'
);

select is(
  (
    api.execute_platform_proof(
      '81000000-0000-0000-0000-000000000099',
      '80000000-0000-0000-0000-000000000001',
      'runtime-first', repeat('a', 64),
      '82000000-0000-0000-0000-000000000001',
      'first proof', false
    )->>'duplicate'
  ),
  'true',
  'an exact duplicate returns the prior result'
);
select is(
  (select count(*) from app_private.synthetic_platform_proofs),
  1::bigint,
  'an exact duplicate creates no second effect'
);

select throws_ok(
  $$
    select api.execute_platform_proof(
      '81000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000001',
      'runtime-first', repeat('b', 64),
      '82000000-0000-0000-0000-000000000001',
      'different proof', false
    )
  $$,
  'P0001', 'idempotency_key_reused',
  'an idempotency fingerprint mismatch is rejected'
);

select throws_ok(
  $$
    select api.execute_platform_proof(
      '81000000-0000-0000-0000-000000000003',
      '80000000-0000-0000-0000-000000000001',
      'runtime-rollback', repeat('c', 64),
      '82000000-0000-0000-0000-000000000003',
      'rollback proof', true
    )
  $$,
  'P0001', 'synthetic_forced_rollback',
  'a forced pre-commit failure rolls back the transaction'
);
select is(
  (
    select count(*) from app_private.synthetic_platform_proofs
    where proof_id = '81000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'forced rollback leaves no synthetic state'
);
select is(
  (
    select count(*) from app_private.idempotency_records
    where operation_key = 'platform.proof.execute' and idempotency_key = 'runtime-rollback'
  ),
  0::bigint,
  'forced rollback leaves no successful idempotency record'
);

select lives_ok(
  $$ select count(*) from api.claim_outbox_events('worker-one', 1) $$,
  'an eligible event can be claimed'
);
select is(
  (
    select delivery_status from app_private.outbox_events
    where aggregate_id = '81000000-0000-0000-0000-000000000001'
  ),
  'processing',
  'claiming moves the event to processing'
);
select is(
  (select count(*) from api.claim_outbox_events('worker-two', 1)),
  0::bigint,
  'an already claimed event cannot be claimed simultaneously'
);
select ok(
  api.complete_outbox_event(
    (
      select event_id from app_private.outbox_events
      where aggregate_id = '81000000-0000-0000-0000-000000000001'
    ),
    'worker-one'
  ),
  'the owning worker can complete its claim'
);
select is(
  (
    select delivery_status from app_private.outbox_events
    where aggregate_id = '81000000-0000-0000-0000-000000000001'
  ),
  'published',
  'successful dispatch marks the event published'
);

select lives_ok(
  $$
    select api.execute_platform_proof(
      '81000000-0000-0000-0000-000000000004',
      '80000000-0000-0000-0000-000000000001',
      'runtime-dead', repeat('d', 64),
      '82000000-0000-0000-0000-000000000004',
      'dead proof', false
    )
  $$,
  'a second synthetic event can be created for retry testing'
);
select lives_ok(
  $$ select count(*) from api.claim_outbox_events('worker-dead', 1) $$,
  'the retry event can be claimed'
);
select is(
  api.fail_outbox_event(
    (
      select event_id from app_private.outbox_events
      where aggregate_id = '81000000-0000-0000-0000-000000000004'
    ),
    'worker-dead', 'synthetic retry', 2, 1, 60
  ),
  'retry_scheduled',
  'the first retryable failure is scheduled'
);
select lives_ok(
  $$
    update app_private.outbox_events set available_at = now()
    where aggregate_id = '81000000-0000-0000-0000-000000000004'
  $$,
  'the test advances the bounded retry availability time'
);
select lives_ok(
  $$ select count(*) from api.claim_outbox_events('worker-dead', 1) $$,
  'the retry can be reclaimed after backoff'
);
select is(
  api.fail_outbox_event(
    (
      select event_id from app_private.outbox_events
      where aggregate_id = '81000000-0000-0000-0000-000000000004'
    ),
    'worker-dead', 'synthetic terminal failure', 2, 1, 60
  ),
  'dead_letter',
  'the bounded final failure moves the event to dead-letter'
);
select is(
  (
    select delivery_status from app_private.outbox_events
    where aggregate_id = '81000000-0000-0000-0000-000000000004'
  ),
  'dead_letter',
  'dead-letter state is durable'
);
select is(
  api.get_outbox_health()->>'status',
  'degraded',
  'dead letters are visible through diagnostics health'
);
select ok(
  api.replay_dead_letter_event(
    (
      select event_id from app_private.outbox_events
      where aggregate_id = '81000000-0000-0000-0000-000000000004'
    ),
    '80000000-0000-0000-0000-000000000001'
  ),
  'an authorized operator can replay a dead-letter event'
);
select is(
  (
    select delivery_status || ':' || replay_count::text
    from app_private.outbox_events
    where aggregate_id = '81000000-0000-0000-0000-000000000004'
  ),
  'pending:1',
  'replay makes the same event eligible without creating a duplicate event'
);
select is(
  (
    select count(*) from app_private.technical_audit_facts
    where action_key = 'platform_proof.dead_letter_replayed'
  ),
  1::bigint,
  'dead-letter replay is audited'
);
select is(
  api.get_runtime_configuration('production')->'runtime.proof-enabled',
  'null'::jsonb,
  'missing required production proof configuration remains safely unset'
);

set local role authenticated;
select throws_ok(
  $$ select api.get_database_health() $$,
  '42501', null, 'authenticated clients cannot call internal runtime functions directly'
);
select throws_ok(
  $$ select * from app_private.synthetic_platform_proofs $$,
  '42501', null, 'authenticated clients cannot read synthetic private state'
);
reset role;

select * from finish();
rollback;
