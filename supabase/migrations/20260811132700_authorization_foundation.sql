-- Phase 0B-3 authorization proof of concept.
-- These entities model identity linkage and authorization only; they are not
-- operational business entities.

create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.roles (
  role_id uuid primary key default gen_random_uuid(),
  role_key text not null unique check (role_key ~ '^[a-z][a-z0-9_.-]*$'),
  display_name text not null check (char_length(display_name) between 1 and 100),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table app_private.permissions (
  permission_key text primary key check (permission_key ~ '^[a-z][a-z0-9_.-]*$'),
  description text not null check (char_length(description) between 1 and 500),
  created_at timestamptz not null default now()
);

create table app_private.role_permissions (
  role_id uuid not null references app_private.roles (role_id) on delete cascade,
  permission_key text not null references app_private.permissions (permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create table app_private.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references app_private.roles (role_id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table app_private.user_access_scopes (
  access_scope_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scope_kind text not null check (scope_kind in ('global', 'service_region', 'team', 'vehicle')),
  scope_id uuid,
  assigned_at timestamptz not null default now(),
  constraint user_access_scopes_scope_shape check (
    (scope_kind = 'global' and scope_id is null)
    or (scope_kind <> 'global' and scope_id is not null)
  )
);

create unique index user_access_scopes_unique_global
  on app_private.user_access_scopes (user_id)
  where scope_kind = 'global';

create unique index user_access_scopes_unique_resource
  on app_private.user_access_scopes (user_id, scope_kind, scope_id)
  where scope_kind <> 'global';

create index role_permissions_permission_idx
  on app_private.role_permissions (permission_key, role_id);

create index user_roles_user_idx
  on app_private.user_roles (user_id, role_id);

create index user_access_scopes_lookup_idx
  on app_private.user_access_scopes (user_id, scope_kind, scope_id);

alter table public.user_profiles enable row level security;
alter table app_private.roles enable row level security;
alter table app_private.permissions enable row level security;
alter table app_private.role_permissions enable row level security;
alter table app_private.user_roles enable row level security;
alter table app_private.user_access_scopes enable row level security;

revoke all on table public.user_profiles from anon, authenticated;
grant select on table public.user_profiles to authenticated;

revoke all on table app_private.roles from public, anon, authenticated;
revoke all on table app_private.permissions from public, anon, authenticated;
revoke all on table app_private.role_permissions from public, anon, authenticated;
revoke all on table app_private.user_roles from public, anon, authenticated;
revoke all on table app_private.user_access_scopes from public, anon, authenticated;

create policy user_profiles_select_own
  on public.user_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function app_private.is_authorized(
  requested_permission text,
  requested_scope_kind text,
  requested_scope_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles as profile
    join app_private.user_roles as user_role
      on user_role.user_id = profile.user_id
    join app_private.role_permissions as role_permission
      on role_permission.role_id = user_role.role_id
    where profile.user_id = (select auth.uid())
      and profile.is_active
      and role_permission.permission_key = requested_permission
      and exists (
        select 1
        from app_private.user_access_scopes as access_scope
        where access_scope.user_id = profile.user_id
          and (
            access_scope.scope_kind = 'global'
            or (
              requested_scope_kind <> 'global'
              and access_scope.scope_kind = requested_scope_kind
              and access_scope.scope_id = requested_scope_id
            )
          )
      )
  );
$$;

revoke all on function app_private.is_authorized(text, text, uuid) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_authorized(text, text, uuid) to authenticated;

create table public.authorization_probes (
  authorization_probe_id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(label) between 1 and 100),
  required_permission text not null references app_private.permissions (permission_key),
  scope_kind text not null check (scope_kind in ('global', 'service_region', 'team', 'vehicle')),
  scope_id uuid,
  created_at timestamptz not null default now(),
  constraint authorization_probes_scope_shape check (
    (scope_kind = 'global' and scope_id is null)
    or (scope_kind <> 'global' and scope_id is not null)
  )
);

comment on table public.authorization_probes is
  'Non-business Phase 0 table used only to prove permission- and scope-aware RLS.';

alter table public.authorization_probes enable row level security;

revoke all on table public.authorization_probes from anon, authenticated;
grant select on table public.authorization_probes to authenticated;

create policy authorization_probes_select_authorized
  on public.authorization_probes
  for select
  to authenticated
  using (
    app_private.is_authorized(required_permission, scope_kind, scope_id)
  );
