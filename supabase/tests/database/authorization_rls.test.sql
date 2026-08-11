begin;

select plan(14);

select has_table('public', 'user_profiles', 'user profiles table exists');
select has_table('app_private', 'roles', 'roles table exists in the private schema');
select has_table('app_private', 'permissions', 'permissions table exists in the private schema');
select has_table('app_private', 'role_permissions', 'role-permission assignments exist');
select has_table('app_private', 'user_roles', 'user-role assignments exist');
select has_table('app_private', 'user_access_scopes', 'user access scopes exist');
select has_table('public', 'authorization_probes', 'the non-business RLS probe exists');
select has_function(
  'app_private',
  'is_authorized',
  array['text', 'text', 'uuid'],
  'permission and scope checks use the private authorization helper'
);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'global@example.test', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000002', 'region@example.test', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000003', 'denied@example.test', '{}', '{}'),
  ('00000000-0000-0000-0000-000000000004', 'inactive@example.test', '{}', '{}');

insert into public.user_profiles (user_id, display_name, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'Global User', true),
  ('00000000-0000-0000-0000-000000000002', 'Region User', true),
  ('00000000-0000-0000-0000-000000000003', 'Denied User', true),
  ('00000000-0000-0000-0000-000000000004', 'Inactive User', false);

insert into app_private.permissions (permission_key, description)
values ('authorization_probe.read', 'Read the Phase 0 authorization proof resource');

insert into app_private.roles (role_id, role_key, display_name, is_system)
values
  ('10000000-0000-0000-0000-000000000001', 'proof_reader', 'Proof Reader', true),
  ('10000000-0000-0000-0000-000000000002', 'proof_denied', 'Proof Denied', true);

insert into app_private.role_permissions (role_id, permission_key)
values (
  '10000000-0000-0000-0000-000000000001',
  'authorization_probe.read'
);

insert into app_private.user_roles (user_id, role_id)
values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001');

insert into app_private.user_access_scopes (user_id, scope_kind, scope_id)
values
  ('00000000-0000-0000-0000-000000000001', 'global', null),
  ('00000000-0000-0000-0000-000000000002', 'service_region', '20000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000003', 'global', null),
  ('00000000-0000-0000-0000-000000000004', 'global', null);

insert into public.authorization_probes (
  authorization_probe_id,
  label,
  required_permission,
  scope_kind,
  scope_id
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    'global',
    'authorization_probe.read',
    'global',
    null
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    'region-a',
    'authorization_probe.read',
    'service_region',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    'region-b',
    'authorization_probe.read',
    'service_region',
    '20000000-0000-0000-0000-000000000002'
  );

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}',
  true
);

select is(
  (select count(*) from public.authorization_probes),
  3::bigint,
  'a permitted user with global scope can read every scoped proof row'
);

select is(
  (select count(*) from public.user_profiles),
  1::bigint,
  'an authenticated user can read only their own profile'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000002"}',
  true
);

select results_eq(
  $$ select label from public.authorization_probes order by label $$,
  $$ values ('region-a'::text) $$,
  'a region-scoped user can read only the matching region'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000003","user_metadata":{"role":"admin"}}',
  true
);

select is(
  (select count(*) from public.authorization_probes),
  0::bigint,
  'user-editable metadata cannot grant a missing permission'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000004"}',
  true
);

select is(
  (select count(*) from public.authorization_probes),
  0::bigint,
  'inactive users are denied even when role and scope assignments exist'
);

select throws_ok(
  $$
    insert into public.authorization_probes (
      label,
      required_permission,
      scope_kind
    ) values (
      'unauthorized-write',
      'authorization_probe.read',
      'global'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot write directly to the proof resource'
);

reset role;

select * from finish();
rollback;
