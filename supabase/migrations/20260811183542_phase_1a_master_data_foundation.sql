-- Phase 1A authoritative master-data foundation.
create extension if not exists postgis with schema extensions;

create table app_private.service_regions (
  service_region_id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  region_code text not null unique check (region_code ~ '^[A-Z][A-Z0-9_-]{1,19}$'),
  default_timezone text not null default 'Africa/Johannesburg',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.depots (
  depot_id uuid primary key default gen_random_uuid(),
  service_region_id uuid not null references app_private.service_regions,
  name text not null check (char_length(name) between 1 and 120),
  address_line_1 text not null,
  address_line_2 text,
  suburb text not null,
  city text not null,
  postal_code text,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  location extensions.geography(point, 4326),
  geofence_radius_metres integer not null default 100 check (geofence_radius_metres between 10 and 5000),
  operating_configuration jsonb not null default '{}' check (jsonb_typeof(operating_configuration) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_region_id, name),
  constraint depots_coordinate_pair check ((latitude is null) = (longitude is null))
);

create table app_private.territories (
  territory_id uuid primary key default gen_random_uuid(),
  service_region_id uuid not null references app_private.service_regions,
  name text not null check (char_length(name) between 1 and 120),
  priority integer not null default 0 check (priority between -10000 and 10000),
  default_depot_id uuid references app_private.depots,
  boundary extensions.geometry(multipolygon, 4326),
  preferred_collection_days smallint[] not null default '{}',
  service_status text not null default 'active' check (service_status in ('active', 'inactive', 'limited')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_region_id, name),
  constraint territories_collection_days check (
    preferred_collection_days <@ array[1,2,3,4,5,6,7]::smallint[]
  )
);

create table app_private.teams (
  team_id uuid primary key default gen_random_uuid(),
  service_region_id uuid not null references app_private.service_regions,
  default_depot_id uuid references app_private.depots,
  team_code text not null check (team_code ~ '^[A-Z][A-Z0-9_-]{1,19}$'),
  name text not null check (char_length(name) between 1 and 120),
  normal_vehicle_id uuid,
  working_hours jsonb not null default '{}' check (jsonb_typeof(working_hours) = 'object'),
  route_eligibility jsonb not null default '{}' check (jsonb_typeof(route_eligibility) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_region_id, team_code)
);

create table app_private.staff (
  staff_id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 160),
  mobile_e164 text check (mobile_e164 is null or mobile_e164 ~ '^\\+27[6-8][0-9]{8}$'),
  operational_role text not null check (operational_role in ('driver', 'assistant', 'supervisor', 'other')),
  default_team_id uuid references app_private.teams,
  availability_configuration jsonb not null default '{}' check (jsonb_typeof(availability_configuration) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.vehicles (
  vehicle_id uuid primary key default gen_random_uuid(),
  service_region_id uuid not null references app_private.service_regions,
  default_depot_id uuid references app_private.depots,
  default_team_id uuid references app_private.teams,
  registration_reference text not null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  operational_availability text not null default 'available' check (
    operational_availability in ('available', 'in_service', 'maintenance', 'unavailable', 'retired')
  ),
  estimated_drum_capacity integer check (estimated_drum_capacity > 0),
  working_hours jsonb not null default '{}' check (jsonb_typeof(working_hours) = 'object'),
  after_hours_grace_minutes integer not null default 0 check (after_hours_grace_minutes between 0 and 720),
  current_odometer_km numeric(12,1) check (current_odometer_km >= 0),
  maintenance_configuration jsonb not null default '{}' check (jsonb_typeof(maintenance_configuration) = 'object'),
  compliance_metadata jsonb not null default '{}' check (jsonb_typeof(compliance_metadata) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_region_id, registration_reference)
);

alter table app_private.teams
  add constraint teams_normal_vehicle_fk foreign key (normal_vehicle_id) references app_private.vehicles;

create table app_private.territory_eligible_teams (
  territory_id uuid not null references app_private.territories on delete cascade,
  team_id uuid not null references app_private.teams on delete cascade,
  created_at timestamptz not null default now(),
  primary key (territory_id, team_id)
);

create table app_private.clients (
  client_id uuid primary key default gen_random_uuid(),
  client_type text not null check (client_type in ('individual', 'organisation')),
  display_name text not null check (char_length(display_name) between 1 and 200),
  legal_name text,
  organisation_name text,
  company_registration_number text,
  south_african_id_number text,
  lifecycle_status text not null default 'pending' check (
    lifecycle_status in ('pending', 'active', 'on_hold', 'cancelled', 'archived')
  ),
  activated_at timestamptz,
  cancelled_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_type_shape check (
    (client_type = 'individual' and organisation_name is null)
    or (client_type = 'organisation' and organisation_name is not null)
  ),
  constraint clients_status_timestamps check (
    (lifecycle_status <> 'active' or activated_at is not null)
    and (lifecycle_status <> 'cancelled' or cancelled_at is not null)
    and (lifecycle_status <> 'archived' or archived_at is not null)
  )
);

create table app_private.client_contacts (
  client_contact_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app_private.clients,
  contact_name text not null check (char_length(contact_name) between 1 and 160),
  mobile_e164 text check (mobile_e164 is null or mobile_e164 ~ '^\\+27[6-8][0-9]{8}$'),
  email text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'),
  preferred_language text not null default 'english' check (preferred_language in ('english', 'afrikaans')),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mobile_e164 is not null or email is not null)
);

create unique index client_contacts_one_primary
  on app_private.client_contacts (client_id) where is_primary and is_active;

create table app_private.service_addresses (
  service_address_id uuid primary key default gen_random_uuid(),
  address_line_1 text not null,
  address_line_2 text,
  suburb text not null,
  city text not null,
  postal_code text,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  location extensions.geography(point, 4326),
  geocoding_status text not null default 'not_geocoded' check (
    geocoding_status in ('not_geocoded', 'pending', 'geocoded', 'failed')
  ),
  validation_status text not null default 'unvalidated' check (
    validation_status in ('unvalidated', 'valid', 'invalid', 'needs_review')
  ),
  manual_review_required boolean not null default false,
  property_type text,
  drum_placement text,
  access_notes text,
  security_instructions text,
  dangerous_animal boolean not null default false,
  stairs_elevation_notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_addresses_coordinate_pair check ((latitude is null) = (longitude is null))
);

create table app_private.client_services (
  client_service_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references app_private.clients,
  service_address_id uuid not null references app_private.service_addresses,
  lifecycle_status text not null default 'pending' check (
    lifecycle_status in ('pending', 'active', 'on_hold', 'cancelled', 'archived')
  ),
  service_start_date date,
  service_end_date date,
  cadence_code text not null default 'weekly' check (
    cadence_code in ('weekly', 'fortnightly', 'monthly', 'custom')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint client_services_dates check (
    service_end_date is null or service_start_date is null or service_end_date >= service_start_date
  )
);

create table app_private.service_configurations (
  service_configuration_id uuid primary key default gen_random_uuid(),
  client_service_id uuid not null references app_private.client_services,
  service_region_id uuid not null references app_private.service_regions,
  territory_id uuid references app_private.territories,
  territory_is_override boolean not null default false,
  depot_id uuid references app_private.depots,
  default_team_id uuid references app_private.teams,
  configured_drum_count integer not null check (configured_drum_count > 0),
  operational_drum_unit_count integer not null check (operational_drum_unit_count > 0),
  configured_collection_day smallint check (configured_collection_day between 1 and 7),
  access_configuration jsonb not null default '{}' check (jsonb_typeof(access_configuration) = 'object'),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_configurations_dates check (effective_to is null or effective_to >= effective_from)
);

create unique index service_configuration_one_current
  on app_private.service_configurations (client_service_id) where effective_to is null;

create table app_private.vehicle_tracking_devices (
  vehicle_tracking_device_id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references app_private.vehicles,
  provider_key text not null,
  device_reference text not null,
  valid_from timestamptz not null default now(),
  retired_at timestamptz,
  unique (provider_key, device_reference)
);

create table app_private.external_references (
  external_reference_id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system ~ '^[a-z][a-z0-9_.-]*$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_.-]*$'),
  internal_entity_id uuid not null,
  external_identifier text not null check (char_length(external_identifier) between 1 and 500),
  valid_from timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index external_references_active_unique
  on app_private.external_references (source_system, entity_type, external_identifier)
  where retired_at is null;

create table app_private.business_audit_facts (
  business_audit_id uuid primary key default gen_random_uuid(),
  action_key text not null check (action_key ~ '^[a-z][a-z0-9_.-]*$'),
  actor_id uuid references auth.users on delete set null,
  module_key text not null,
  target_type text not null,
  target_id uuid not null,
  correlation_id uuid not null,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default now()
);

create index depots_region_idx on app_private.depots (service_region_id);
create index territories_boundary_idx on app_private.territories using gist (boundary);
create index territories_region_priority_idx on app_private.territories (service_region_id, priority desc);
create index teams_region_idx on app_private.teams (service_region_id);
create index vehicles_region_idx on app_private.vehicles (service_region_id);
create index services_client_idx on app_private.client_services (client_id);
create index services_address_idx on app_private.client_services (service_address_id);
create index configurations_region_idx on app_private.service_configurations (service_region_id);
create index service_addresses_location_idx on app_private.service_addresses using gist (location);
create index depots_location_idx on app_private.depots using gist (location);

create or replace function app_private.set_point_from_coordinates()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.latitude is null then new.location := null;
  else
    new.location := extensions.st_setsrid(
      extensions.st_makepoint(new.longitude::double precision, new.latitude::double precision), 4326
    )::extensions.geography;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger depots_set_point before insert or update of latitude, longitude on app_private.depots
for each row execute function app_private.set_point_from_coordinates();
create trigger service_addresses_set_point before insert or update of latitude, longitude on app_private.service_addresses
for each row execute function app_private.set_point_from_coordinates();

insert into app_private.permissions (permission_key, description) values
  ('master_data.read', 'Read non-sensitive master data within an assigned region'),
  ('master_data.write', 'Manage master data within an assigned region'),
  ('clients.sensitive.read', 'Read client identity and contact data within an assigned region'),
  ('external_references.manage', 'Manage scoped external reference mappings')
on conflict (permission_key) do nothing;

insert into app_private.roles (role_key, display_name, is_system) values
  ('director_admin', 'Director/Admin', true),
  ('operations_manager', 'Operations Manager', true),
  ('office_admin', 'Office/Admin', true),
  ('driver_team', 'Driver/Team', true),
  ('system_admin_developer', 'System Admin/Developer', true)
on conflict (role_key) do nothing;

insert into app_private.role_permissions (role_id, permission_key)
select role.role_id, permission.permission_key
from app_private.roles role
cross join app_private.permissions permission
where role.role_key in ('director_admin', 'operations_manager', 'office_admin')
  and permission.permission_key in ('master_data.read', 'master_data.write', 'clients.sensitive.read')
on conflict do nothing;

insert into app_private.role_permissions (role_id, permission_key)
select role.role_id, permission.permission_key
from app_private.roles role
cross join app_private.permissions permission
where role.role_key = 'system_admin_developer'
  and permission.permission_key in ('master_data.read', 'master_data.write', 'external_references.manage')
on conflict do nothing;

create or replace function app_private.user_has_region_permission(
  p_user_id uuid, p_permission text, p_service_region_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_profiles profile
    join app_private.user_roles user_role on user_role.user_id = profile.user_id
    join app_private.role_permissions role_permission on role_permission.role_id = user_role.role_id
    join app_private.user_access_scopes access_scope on access_scope.user_id = profile.user_id
    where profile.user_id = p_user_id and profile.is_active
      and role_permission.permission_key = p_permission
      and (access_scope.scope_kind = 'global'
        or (access_scope.scope_kind = 'service_region' and access_scope.scope_id = p_service_region_id))
  );
$$;

revoke all on function app_private.user_has_region_permission(uuid,text,uuid) from public;
grant execute on function app_private.user_has_region_permission(uuid,text,uuid) to authenticated, service_role;

create or replace function app_private.current_user_can_read_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app_private.client_services service
    join app_private.service_configurations configuration
      on configuration.client_service_id = service.client_service_id and configuration.effective_to is null
    where service.client_id = p_client_id
      and app_private.user_has_region_permission(
        (select auth.uid()), 'clients.sensitive.read', configuration.service_region_id
      )
  ) or app_private.user_has_global_permission((select auth.uid()), 'clients.sensitive.read');
$$;

revoke all on function app_private.current_user_can_read_client(uuid) from public;
grant execute on function app_private.current_user_can_read_client(uuid) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'service_regions','depots','territories','teams','staff','vehicles',
    'territory_eligible_teams','clients','client_contacts','service_addresses',
    'client_services','service_configurations','vehicle_tracking_devices',
    'external_references','business_audit_facts'
  ] loop
    execute format('alter table app_private.%I enable row level security', table_name);
    execute format('revoke all on table app_private.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update on table app_private.%I to service_role', table_name);
  end loop;
end $$;

grant select on app_private.service_regions, app_private.depots, app_private.territories,
  app_private.teams, app_private.staff, app_private.vehicles,
  app_private.territory_eligible_teams, app_private.client_services,
  app_private.service_configurations, app_private.service_addresses to authenticated;
grant select on app_private.clients, app_private.client_contacts to authenticated;

create policy regions_read on app_private.service_regions for select to authenticated using (
  app_private.user_has_region_permission((select auth.uid()), 'master_data.read', service_region_id)
);
create policy depots_read on app_private.depots for select to authenticated using (
  app_private.user_has_region_permission((select auth.uid()), 'master_data.read', service_region_id)
);
create policy territories_read on app_private.territories for select to authenticated using (
  app_private.user_has_region_permission((select auth.uid()), 'master_data.read', service_region_id)
);
create policy teams_read on app_private.teams for select to authenticated using (
  app_private.user_has_region_permission((select auth.uid()), 'master_data.read', service_region_id)
);
create policy vehicles_read on app_private.vehicles for select to authenticated using (
  app_private.user_has_region_permission((select auth.uid()), 'master_data.read', service_region_id)
);
create policy configurations_read on app_private.service_configurations for select to authenticated using (
  app_private.user_has_region_permission((select auth.uid()), 'master_data.read', service_region_id)
);
create policy services_read on app_private.client_services for select to authenticated using (
  exists (select 1 from app_private.service_configurations configuration
    where configuration.client_service_id = client_services.client_service_id
      and configuration.effective_to is null
      and app_private.user_has_region_permission((select auth.uid()), 'master_data.read', configuration.service_region_id))
);
create policy addresses_read on app_private.service_addresses for select to authenticated using (
  exists (select 1 from app_private.client_services service
    join app_private.service_configurations configuration
      on configuration.client_service_id = service.client_service_id and configuration.effective_to is null
    where service.service_address_id = service_addresses.service_address_id
      and app_private.user_has_region_permission((select auth.uid()), 'master_data.read', configuration.service_region_id))
);
create policy staff_read on app_private.staff for select to authenticated using (
  default_team_id is not null and exists (select 1 from app_private.teams team
    where team.team_id = staff.default_team_id
      and app_private.user_has_region_permission((select auth.uid()), 'master_data.read', team.service_region_id))
);
create policy eligible_teams_read on app_private.territory_eligible_teams for select to authenticated using (
  exists (select 1 from app_private.territories territory
    where territory.territory_id = territory_eligible_teams.territory_id
      and app_private.user_has_region_permission((select auth.uid()), 'master_data.read', territory.service_region_id))
);
create policy clients_sensitive_read on app_private.clients for select to authenticated using (
  app_private.current_user_can_read_client(client_id)
);
create policy contacts_sensitive_read on app_private.client_contacts for select to authenticated using (
  app_private.current_user_can_read_client(client_id)
);

create or replace function api.create_client(
  p_actor_id uuid, p_idempotency_key text, p_request_fingerprint text,
  p_correlation_id uuid, p_client jsonb
)
returns jsonb language plpgsql set search_path = '' as $$
declare reserved boolean; existing app_private.idempotency_records%rowtype;
  new_id uuid := coalesce((p_client->>'clientId')::uuid, gen_random_uuid()); result jsonb; event_id uuid := gen_random_uuid();
begin
  if not app_private.user_has_global_permission(p_actor_id, 'master_data.write') then
    raise exception 'master_data permission denied' using errcode='42501';
  end if;
  insert into app_private.idempotency_records(operation_key,idempotency_key,request_fingerprint,expires_at)
  values('clients.create',p_idempotency_key,p_request_fingerprint,now()+interval '30 days')
  on conflict do nothing returning true into reserved;
  select * into existing from app_private.idempotency_records
    where operation_key='clients.create' and idempotency_key=p_idempotency_key for update;
  if not coalesce(reserved,false) then
    if existing.request_fingerprint<>p_request_fingerprint then raise exception 'idempotency_key_reused' using errcode='P0001'; end if;
    if existing.processing_status='completed' then return jsonb_set(existing.response_body,'{duplicate}','true'); end if;
    raise exception 'idempotency_in_progress' using errcode='55P03';
  end if;
  insert into app_private.clients(client_id,client_type,display_name,legal_name,organisation_name,
    company_registration_number,south_african_id_number,lifecycle_status,activated_at)
  values(new_id,p_client->>'clientType',p_client->>'displayName',p_client->>'legalName',p_client->>'organisationName',
    p_client->>'companyRegistrationNumber',p_client->>'southAfricanIdNumber',coalesce(p_client->>'lifecycleStatus','pending'),
    case when p_client->>'lifecycleStatus'='active' then now() end);
  insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state)
  values('clients.created',p_actor_id,'clients','client',new_id,p_correlation_id,p_client);
  insert into app_private.outbox_events(event_id,producer_module,event_name,event_version,aggregate_type,aggregate_id,
    payload,correlation_id,actor_kind,actor_id,occurred_at)
  values(event_id,'clients','Clients.ClientCreated',1,'client',new_id,jsonb_build_object('clientId',new_id),
    p_correlation_id,'user',p_actor_id::text,now());
  result:=jsonb_build_object('clientId',new_id,'eventId',event_id,'duplicate',false);
  update app_private.idempotency_records set processing_status='completed',response_status=201,response_body=result,completed_at=now()
    where idempotency_record_id=existing.idempotency_record_id;
  return result;
end $$;

create or replace function api.update_client(
  p_actor_id uuid, p_client_id uuid, p_correlation_id uuid, p_patch jsonb
)
returns jsonb language plpgsql set search_path = '' as $$
declare before_row jsonb; after_row jsonb; previous_status text; next_status text; event_name text;
begin
  if not app_private.user_has_global_permission(p_actor_id,'master_data.write') then raise exception 'permission denied' using errcode='42501'; end if;
  select to_jsonb(client), client.lifecycle_status into before_row, previous_status
    from app_private.clients client where client.client_id=p_client_id for update;
  if before_row is null then raise exception 'client not found' using errcode='P0002'; end if;
  next_status:=coalesce(p_patch->>'lifecycleStatus',previous_status);
  update app_private.clients set
    display_name=coalesce(p_patch->>'displayName',display_name), legal_name=coalesce(p_patch->>'legalName',legal_name),
    organisation_name=coalesce(p_patch->>'organisationName',organisation_name), lifecycle_status=next_status,
    activated_at=case when next_status='active' then coalesce(activated_at,now()) else activated_at end,
    cancelled_at=case when next_status='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,
    archived_at=case when next_status='archived' then coalesce(archived_at,now()) else archived_at end, updated_at=now()
  where client_id=p_client_id returning to_jsonb(clients.*) into after_row;
  insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,before_state,after_state)
    values('clients.updated',p_actor_id,'clients','client',p_client_id,p_correlation_id,before_row,after_row);
  event_name:=case next_status when 'active' then 'Clients.ClientActivated' when 'on_hold' then 'Clients.ClientPlacedOnHold'
    when 'cancelled' then 'Clients.ClientCancelled' else null end;
  if event_name is not null and next_status<>previous_status then
    insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,
      correlation_id,actor_kind,actor_id,occurred_at)
    values('clients',event_name,1,'client',p_client_id,jsonb_build_object('clientId',p_client_id,'previousStatus',previous_status,'status',next_status),
      p_correlation_id,'user',p_actor_id::text,now());
  end if;
  return after_row;
end $$;

create or replace function api.archive_client(p_actor_id uuid,p_client_id uuid,p_correlation_id uuid)
returns jsonb language sql set search_path='' as $$
  select api.update_client(p_actor_id,p_client_id,p_correlation_id,jsonb_build_object('lifecycleStatus','archived'));
$$;

create or replace function api.create_service_address(
  p_actor_id uuid,p_correlation_id uuid,p_address jsonb
)
returns jsonb language plpgsql set search_path='' as $$
declare new_id uuid:=coalesce((p_address->>'serviceAddressId')::uuid,gen_random_uuid());
begin
  if not app_private.user_has_global_permission(p_actor_id,'master_data.write') then raise exception 'permission denied' using errcode='42501'; end if;
  insert into app_private.service_addresses(service_address_id,address_line_1,address_line_2,suburb,city,postal_code,
    latitude,longitude,property_type,drum_placement,access_notes,security_instructions,dangerous_animal,stairs_elevation_notes)
  values(new_id,p_address->>'addressLine1',p_address->>'addressLine2',p_address->>'suburb',p_address->>'city',p_address->>'postalCode',
    (p_address->>'latitude')::numeric,(p_address->>'longitude')::numeric,p_address->>'propertyType',p_address->>'drumPlacement',
    p_address->>'accessNotes',p_address->>'securityInstructions',coalesce((p_address->>'dangerousAnimal')::boolean,false),p_address->>'stairsElevationNotes');
  insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state)
    values('service_addresses.created',p_actor_id,'service-addresses','service_address',new_id,p_correlation_id,p_address);
  insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at)
    values('service-addresses','ServiceAddresses.ServiceAddressCreated',1,'service-address',new_id,jsonb_build_object('serviceAddressId',new_id),p_correlation_id,'user',p_actor_id::text,now());
  return jsonb_build_object('serviceAddressId',new_id);
end $$;

create or replace function api.update_service_address(
  p_actor_id uuid,p_service_address_id uuid,p_correlation_id uuid,p_patch jsonb
)
returns jsonb language plpgsql set search_path='' as $$
declare before_row jsonb; after_row jsonb;
begin
  if not app_private.user_has_global_permission(p_actor_id,'master_data.write') then raise exception 'permission denied' using errcode='42501'; end if;
  select to_jsonb(address) into before_row from app_private.service_addresses address where address.service_address_id=p_service_address_id for update;
  update app_private.service_addresses set address_line_1=coalesce(p_patch->>'addressLine1',address_line_1),
    address_line_2=coalesce(p_patch->>'addressLine2',address_line_2),suburb=coalesce(p_patch->>'suburb',suburb),
    city=coalesce(p_patch->>'city',city),postal_code=coalesce(p_patch->>'postalCode',postal_code),
    access_notes=coalesce(p_patch->>'accessNotes',access_notes),updated_at=now()
  where service_address_id=p_service_address_id returning to_jsonb(service_addresses.*) into after_row;
  if after_row is null then raise exception 'address not found' using errcode='P0002'; end if;
  insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,before_state,after_state)
    values('service_addresses.updated',p_actor_id,'service-addresses','service_address',p_service_address_id,p_correlation_id,before_row,after_row);
  insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at)
    values('service-addresses','ServiceAddresses.ServiceAddressChanged',1,'service-address',p_service_address_id,
      jsonb_build_object('serviceAddressId',p_service_address_id),p_correlation_id,'user',p_actor_id::text,now());
  return after_row;
end $$;

create or replace function api.create_client_service(
  p_actor_id uuid,p_correlation_id uuid,p_service jsonb
)
returns jsonb language plpgsql set search_path='' as $$
declare new_id uuid:=coalesce((p_service->>'clientServiceId')::uuid,gen_random_uuid());
begin
  if not app_private.user_has_global_permission(p_actor_id,'master_data.write') then raise exception 'permission denied' using errcode='42501'; end if;
  insert into app_private.client_services(client_service_id,client_id,service_address_id,lifecycle_status,service_start_date,service_end_date,cadence_code)
  values(new_id,(p_service->>'clientId')::uuid,(p_service->>'serviceAddressId')::uuid,coalesce(p_service->>'lifecycleStatus','pending'),
    (p_service->>'serviceStartDate')::date,(p_service->>'serviceEndDate')::date,coalesce(p_service->>'cadenceCode','weekly'));
  insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state)
    values('client_services.created',p_actor_id,'clients','client_service',new_id,p_correlation_id,p_service);
  return jsonb_build_object('clientServiceId',new_id);
end $$;

create or replace function api.configure_service(
  p_actor_id uuid,p_correlation_id uuid,p_configuration jsonb
)
returns jsonb language plpgsql set search_path='' as $$
declare new_id uuid:=gen_random_uuid(); service_id uuid:=(p_configuration->>'clientServiceId')::uuid; previous_count integer;
begin
  if not app_private.user_has_region_permission(p_actor_id,'master_data.write',(p_configuration->>'serviceRegionId')::uuid) then
    raise exception 'permission denied' using errcode='42501'; end if;
  select configured_drum_count into previous_count from app_private.service_configurations
    where client_service_id=service_id and effective_to is null for update;
  update app_private.service_configurations set effective_to=((p_configuration->>'effectiveFrom')::date-1),updated_at=now()
    where client_service_id=service_id and effective_to is null;
  insert into app_private.service_configurations(service_configuration_id,client_service_id,service_region_id,territory_id,
    territory_is_override,depot_id,default_team_id,configured_drum_count,operational_drum_unit_count,configured_collection_day,effective_from)
  values(new_id,service_id,(p_configuration->>'serviceRegionId')::uuid,(p_configuration->>'territoryId')::uuid,
    coalesce((p_configuration->>'territoryIsOverride')::boolean,false),(p_configuration->>'depotId')::uuid,
    (p_configuration->>'defaultTeamId')::uuid,(p_configuration->>'configuredDrumCount')::integer,
    coalesce((p_configuration->>'operationalDrumUnitCount')::integer,(p_configuration->>'configuredDrumCount')::integer),
    (p_configuration->>'configuredCollectionDay')::smallint,(p_configuration->>'effectiveFrom')::date);
  insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state)
    values('service_configuration.configured',p_actor_id,'service-configuration','client_service',service_id,p_correlation_id,p_configuration);
  insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at)
    values('service-configuration',case when previous_count is distinct from (p_configuration->>'configuredDrumCount')::integer and previous_count is not null
      then 'ServiceConfiguration.DrumCountChanged' else 'ServiceConfiguration.ServiceConfigured' end,1,'client-service',service_id,
      jsonb_build_object('clientServiceId',service_id,'configuredDrumCount',(p_configuration->>'configuredDrumCount')::integer,'previousDrumCount',previous_count),
      p_correlation_id,'user',p_actor_id::text,now());
  return jsonb_build_object('serviceConfigurationId',new_id);
end $$;

create or replace function api.set_vehicle_availability(
  p_actor_id uuid,p_vehicle_id uuid,p_correlation_id uuid,p_availability text
)
returns jsonb language plpgsql set search_path='' as $$
declare region_id uuid; previous text;
begin
  select service_region_id,operational_availability into region_id,previous from app_private.vehicles where vehicle_id=p_vehicle_id for update;
  if not app_private.user_has_region_permission(p_actor_id,'master_data.write',region_id) then raise exception 'permission denied' using errcode='42501'; end if;
  update app_private.vehicles set operational_availability=p_availability,is_active=(p_availability<>'retired'),updated_at=now() where vehicle_id=p_vehicle_id;
  insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,before_state,after_state)
    values('vehicles.availability_changed',p_actor_id,'vehicles','vehicle',p_vehicle_id,p_correlation_id,
      jsonb_build_object('availability',previous),jsonb_build_object('availability',p_availability));
  insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at)
    values('vehicles','Vehicles.VehicleAvailabilityChanged',1,'vehicle',p_vehicle_id,
      jsonb_build_object('vehicleId',p_vehicle_id,'previousAvailability',previous,'availability',p_availability),p_correlation_id,'user',p_actor_id::text,now());
  return jsonb_build_object('vehicleId',p_vehicle_id,'availability',p_availability);
end $$;

revoke all on function api.create_client(uuid,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function api.update_client(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function api.archive_client(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function api.create_service_address(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function api.update_service_address(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function api.create_client_service(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function api.configure_service(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function api.set_vehicle_availability(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function api.create_client(uuid,text,text,uuid,jsonb),api.update_client(uuid,uuid,uuid,jsonb),
  api.archive_client(uuid,uuid,uuid),api.create_service_address(uuid,uuid,jsonb),api.update_service_address(uuid,uuid,uuid,jsonb),
  api.create_client_service(uuid,uuid,jsonb),api.configure_service(uuid,uuid,jsonb),
  api.set_vehicle_availability(uuid,uuid,uuid,text) to service_role;
