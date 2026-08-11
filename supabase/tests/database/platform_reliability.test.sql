begin;

select plan(13);

select has_table('app_private', 'outbox_events', 'the durable outbox exists');
select has_table('app_private', 'idempotency_records', 'the idempotency registry exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'app_private.outbox_events'::regclass),
  'outbox events use defense-in-depth RLS'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'app_private.idempotency_records'::regclass),
  'idempotency records use defense-in-depth RLS'
);

select has_index(
  'app_private',
  'outbox_events',
  'outbox_events_dispatch_idx',
  'pending events have a dispatch index'
);

select has_index(
  'app_private',
  'idempotency_records',
  'idempotency_records_operation_key_unique',
  'operation and idempotency keys are unique together'
);

select lives_ok(
  $$
    insert into app_private.outbox_events (
      event_id,
      producer_module,
      event_name,
      event_version,
      aggregate_type,
      aggregate_id,
      payload,
      correlation_id,
      occurred_at
    ) values (
      '40000000-0000-0000-0000-000000000001',
      'system-health',
      'Platform.FoundationProved',
      1,
      'platform-proof',
      '40000000-0000-0000-0000-000000000002',
      '{"result":"ok"}',
      '40000000-0000-0000-0000-000000000003',
      '2026-08-11T00:00:00Z'
    )
  $$,
  'a valid versioned event can be recorded'
);

select lives_ok(
  $$
    insert into app_private.idempotency_records (
      operation_key,
      idempotency_key,
      request_fingerprint,
      expires_at
    ) values (
      'platform.prove',
      'retry-safe-action',
      repeat('a', 64),
      now() + interval '24 hours'
    )
  $$,
  'a valid in-progress idempotency record can be reserved'
);

select throws_ok(
  $$
    insert into app_private.outbox_events (
      producer_module, event_name, event_version, aggregate_type,
      aggregate_id, payload, correlation_id, occurred_at
    ) values (
      'system-health', 'Platform.InvalidPayload', 1, 'platform-proof',
      gen_random_uuid(), '[]', gen_random_uuid(), now()
    )
  $$,
  '23514',
  null,
  'event payloads must be JSON objects'
);

select throws_ok(
  $$
    insert into app_private.idempotency_records (
      operation_key, idempotency_key, request_fingerprint, expires_at
    ) values (
      'platform.prove', 'retry-safe-action', repeat('b', 64), now() + interval '24 hours'
    )
  $$,
  '23505',
  null,
  'an operation and idempotency key pair cannot be reserved twice'
);

select throws_ok(
  $$
    insert into app_private.idempotency_records (
      operation_key, idempotency_key, request_fingerprint,
      processing_status, expires_at
    ) values (
      'platform.prove', 'invalid-completion', repeat('c', 64),
      'completed', now() + interval '24 hours'
    )
  $$,
  '23514',
  null,
  'completed idempotency records require a completed time and response status'
);

set local role authenticated;

select throws_ok(
  $$ select * from app_private.outbox_events $$,
  '42501',
  null,
  'authenticated clients cannot read the private outbox'
);

select throws_ok(
  $$ select * from app_private.idempotency_records $$,
  '42501',
  null,
  'authenticated clients cannot read private idempotency records'
);

reset role;

select * from finish();
rollback;
