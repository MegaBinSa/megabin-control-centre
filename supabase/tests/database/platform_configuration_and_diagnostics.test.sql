begin;

select plan(28);

select has_table('app_private', 'configuration_definitions', 'configuration definitions exist');
select has_table('app_private', 'configuration_values', 'environment values exist');
select has_table('app_private', 'feature_flags', 'feature flags exist');
select has_table('app_private', 'feature_flag_targets', 'feature targets exist');
select has_table('app_private', 'platform_setting_changes', 'setting changes are auditable');
select has_table('app_private', 'integration_registrations', 'integration registry exists');
select has_table('app_private', 'integration_activity_logs', 'integration activity logs exist');
select has_table('app_private', 'technical_error_logs', 'technical error logs exist');
select has_table('app_private', 'background_job_failures', 'background job failures exist');

select is(
  (
    select count(*)
    from pg_class
    where oid in (
      'app_private.configuration_definitions'::regclass,
      'app_private.configuration_values'::regclass,
      'app_private.feature_flags'::regclass,
      'app_private.feature_flag_targets'::regclass,
      'app_private.platform_setting_changes'::regclass,
      'app_private.integration_registrations'::regclass,
      'app_private.integration_activity_logs'::regclass,
      'app_private.technical_error_logs'::regclass,
      'app_private.background_job_failures'::regclass
    ) and relrowsecurity
  ),
  9::bigint,
  'all Phase 0B-5 private tables use defense-in-depth RLS'
);

select lives_ok(
  $$
    insert into app_private.configuration_definitions (
      configuration_key, description, value_type, is_required, default_value
    ) values ('jobs.max-attempts', 'Maximum job attempts', 'number', true, '3')
  $$,
  'a typed configuration definition can be registered'
);

select throws_ok(
  $$
    insert into app_private.configuration_values (
      configuration_key, environment_name, configuration_value
    ) values ('jobs.max-attempts', 'local', '"three"')
  $$,
  '23514',
  null,
  'environment values must match their registered type'
);

select throws_ok(
  $$
    insert into app_private.configuration_definitions (
      configuration_key, description, value_type
    ) values ('provider.api-key', 'Unsafe ordinary secret', 'string')
  $$,
  '23514',
  null,
  'secret-like keys cannot be ordinary configuration definitions'
);

select lives_ok(
  $$
    insert into app_private.configuration_values (
      configuration_key, environment_name, configuration_value
    ) values ('jobs.max-attempts', 'local', '5')
  $$,
  'a valid environment value can be stored'
);

select is(
  (select count(*) from app_private.platform_setting_changes where setting_kind = 'configuration'),
  1::bigint,
  'configuration value changes are recorded automatically'
);

select lives_ok(
  $$
    insert into app_private.feature_flags (flag_key, description)
    values ('platform.proof', 'Phase 0 feature flag proof')
  $$,
  'a disabled-by-default flag can be registered'
);

select lives_ok(
  $$
    insert into app_private.feature_flag_targets (
      flag_key, environment_name, enabled, service_region_id
    ) values (
      'platform.proof', 'staging', true, '50000000-0000-0000-0000-000000000001'
    )
  $$,
  'a feature flag can target one environment and service region'
);

select is(
  (select count(*) from app_private.platform_setting_changes where setting_kind = 'feature_flag'),
  2::bigint,
  'flag definition and targeting changes are recorded automatically'
);

select lives_ok(
  $$
    insert into app_private.integration_registrations (
      integration_id, integration_key, provider_key, capability_key,
      environment_name, lifecycle_status, integration_mode,
      permitted_inbound_fields, permitted_outbound_events, authentication_reference
    ) values (
      '60000000-0000-0000-0000-000000000001', 'fake.platform-proof', 'fake',
      'platform-proof', 'local', 'tested', 'capture', array['proof_field'],
      array['Platform.FoundationProved'], 'LOCAL_FAKE_REFERENCE'
    )
  $$,
  'a non-live fake integration registration can be stored'
);

select throws_ok(
  $$
    insert into app_private.integration_registrations (
      integration_key, provider_key, capability_key, environment_name, integration_mode
    ) values ('unsafe.live', 'fake', 'platform-proof', 'staging', 'live')
  $$,
  '23514',
  null,
  'live integration mode is prohibited outside production'
);

select lives_ok(
  $$
    insert into app_private.integration_activity_logs (
      integration_id, correlation_id, direction, outcome
    ) values (
      '60000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000002', 'health_check', 'succeeded'
    )
  $$,
  'safe integration activity can be recorded'
);

select ok(
  (select expires_at - occurred_at >= interval '89 days' from app_private.integration_activity_logs limit 1),
  'integration activity defaults to approximately 90-day retention'
);

select lives_ok(
  $$
    insert into app_private.technical_error_logs (
      correlation_id, error_category, safe_message, environment_name, build_id
    ) values (
      '60000000-0000-0000-0000-000000000002', 'dependency_transient',
      'Fake dependency unavailable', 'local', 'test-build'
    )
  $$,
  'a redacted technical error can be recorded'
);

select ok(
  (select expires_at - occurred_at >= interval '29 days' from app_private.technical_error_logs limit 1),
  'technical errors default to approximately 30-day retention'
);

select lives_ok(
  $$
    insert into app_private.background_job_failures (
      job_id, job_type, idempotency_key, concurrency_key, correlation_id,
      attempt, failure_category, safe_message
    ) values (
      '70000000-0000-0000-0000-000000000001', 'platform-proof', 'job-action-1',
      'platform-proof:singleton', '60000000-0000-0000-0000-000000000002',
      1, 'transient_dependency', 'Fake dependency unavailable'
    )
  $$,
  'a background job failure can be recorded without a business record'
);

set local role authenticated;

select throws_ok(
  $$ select * from app_private.configuration_definitions $$,
  '42501', null, 'authenticated clients cannot read private configuration'
);
select throws_ok(
  $$ select * from app_private.integration_registrations $$,
  '42501', null, 'authenticated clients cannot read private integration registrations'
);
select throws_ok(
  $$ select * from app_private.technical_error_logs $$,
  '42501', null, 'authenticated clients cannot read private technical diagnostics'
);

reset role;

select * from finish();
rollback;
