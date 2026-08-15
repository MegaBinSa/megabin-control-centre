begin;

select plan(13);

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values
  ('b1000000-0000-4000-8000-000000000001','staging-office@megabin.local',now(),'{}','{}'),
  ('b1000000-0000-4000-8000-000000000002','staging-driver@megabin.local',now(),'{}','{}');

select lives_ok(
  $$select app_private.provision_synthetic_staging_personas(
    'staging-office@megabin.local','staging-driver@megabin.local',
    'b1000000-0000-4000-8000-000000000003')$$,
  'the bounded administrator transaction provisions the two exact synthetic personas'
);

select is(
  (select display_name from public.user_profiles where user_id='b1000000-0000-4000-8000-000000000001'),
  'Synthetic Staging Office', 'Office profile is linked to the existing Auth identity'
);
select is(
  (select r.role_key from app_private.user_roles ur join app_private.roles r using(role_id)
   where ur.user_id='b1000000-0000-4000-8000-000000000001'),
  'office_admin', 'Office receives only the approved application role'
);
select ok(
  app_private.user_has_region_permission(
    'b1000000-0000-4000-8000-000000000001','master_data.read',
    '51000000-0000-0000-0000-000000000001'),
  'Office has positive permission in the synthetic region'
);
select ok(
  app_private.user_has_region_permission(
    'b1000000-0000-4000-8000-000000000001','clients.sensitive.read',
    '51000000-0000-0000-0000-000000000001'),
  'Office has sensitive Client read permission in the synthetic region'
);
select isnt(
  (select scope_kind from app_private.user_access_scopes
   where user_id='b1000000-0000-4000-8000-000000000001'),
  'global', 'Office is not granted a global scope'
);
select is(
  (select r.role_key from app_private.user_roles ur join app_private.roles r using(role_id)
   where ur.user_id='b1000000-0000-4000-8000-000000000002'),
  'driver_team', 'Driver receives only the Driver/Team application role'
);
select ok(
  exists(select 1 from app_private.staff
    where staff_id='55000000-0000-0000-0000-000000000001'
      and user_id='b1000000-0000-4000-8000-000000000002'
      and default_team_id='54000000-0000-0000-0000-000000000001'),
  'Driver Auth identity is linked to the synthetic staff and team prerequisite'
);
select ok(
  exists(select 1 from app_private.user_access_scopes
    where user_id='b1000000-0000-4000-8000-000000000002'
      and scope_kind='team' and scope_id='54000000-0000-0000-0000-000000000001'),
  'Driver has the bounded team scope'
);
select ok(
  not app_private.user_has_region_permission(
    'b1000000-0000-4000-8000-000000000002','master_data.read',
    '51000000-0000-0000-0000-000000000001'),
  'Driver is denied Office master-data permission'
);
select throws_ok(
  $$select app_private.provision_synthetic_staging_personas(
    'other@megabin.local','staging-driver@megabin.local',gen_random_uuid())$$,
  '22023','staging_persona_identity_not_allowed',
  'the provisioning boundary rejects any unapproved identity'
);
select lives_ok(
  $$select app_private.provision_synthetic_staging_personas(
    'staging-office@megabin.local','staging-driver@megabin.local',
    'b1000000-0000-4000-8000-000000000004')$$,
  'repeated provisioning is idempotent'
);
select is(
  (select count(*) from app_private.business_audit_facts
   where action_key='identity.staging_persona_provisioned'
     and target_id in ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002')),
  2::bigint, 'unchanged repeat provisioning does not duplicate audit facts'
);

select * from finish();
rollback;
