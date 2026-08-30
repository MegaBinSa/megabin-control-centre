-- Keep ordinary master-data creation globally authorised while allowing the
-- already-authorised Website Intake transaction to create its frozen regional
-- aggregate through private owner primitives. These primitives are not an API.

create or replace function app_private.create_client_owned(
  p_actor_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_correlation_id uuid,
  p_client jsonb,
  p_authorization_region_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  reserved boolean;
  existing app_private.idempotency_records%rowtype;
  new_id uuid := coalesce((p_client->>'clientId')::uuid, gen_random_uuid());
  result jsonb;
  event_id uuid := gen_random_uuid();
begin
  if p_authorization_region_id is null then
    if not app_private.user_has_global_permission(p_actor_id, 'master_data.write') then
      raise exception 'master_data permission denied' using errcode = '42501';
    end if;
  elsif not app_private.user_has_region_permission(
      p_actor_id, 'website_intake.activate', p_authorization_region_id
    ) or not app_private.user_has_region_permission(
      p_actor_id, 'master_data.write', p_authorization_region_id
    ) then
    raise exception 'master_data permission denied' using errcode = '42501';
  end if;

  insert into app_private.idempotency_records(
    operation_key, idempotency_key, request_fingerprint, expires_at
  ) values (
    'clients.create', p_idempotency_key, p_request_fingerprint, now() + interval '30 days'
  ) on conflict do nothing returning true into reserved;

  select * into existing
  from app_private.idempotency_records
  where operation_key = 'clients.create' and idempotency_key = p_idempotency_key
  for update;

  if not coalesce(reserved, false) then
    if existing.request_fingerprint <> p_request_fingerprint then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    if existing.processing_status = 'completed' then
      return jsonb_set(existing.response_body, '{duplicate}', 'true');
    end if;
    raise exception 'idempotency_in_progress' using errcode = '55P03';
  end if;

  insert into app_private.clients(
    client_id, client_type, display_name, legal_name, organisation_name,
    company_registration_number, south_african_id_number, lifecycle_status, activated_at
  ) values (
    new_id, p_client->>'clientType', p_client->>'displayName', p_client->>'legalName',
    p_client->>'organisationName', p_client->>'companyRegistrationNumber',
    p_client->>'southAfricanIdNumber', coalesce(p_client->>'lifecycleStatus', 'pending'),
    case when p_client->>'lifecycleStatus' = 'active' then now() end
  );

  insert into app_private.business_audit_facts(
    action_key, actor_id, module_key, target_type, target_id, correlation_id, after_state
  ) values ('clients.created', p_actor_id, 'clients', 'client', new_id, p_correlation_id, p_client);

  insert into app_private.outbox_events(
    event_id, producer_module, event_name, event_version, aggregate_type, aggregate_id,
    payload, correlation_id, actor_kind, actor_id, occurred_at
  ) values (
    event_id, 'clients', 'Clients.ClientCreated', 1, 'client', new_id,
    jsonb_build_object('clientId', new_id), p_correlation_id, 'user', p_actor_id::text, now()
  );

  result := jsonb_build_object('clientId', new_id, 'eventId', event_id, 'duplicate', false);
  update app_private.idempotency_records
  set processing_status = 'completed', response_status = 201, response_body = result,
      completed_at = now()
  where idempotency_record_id = existing.idempotency_record_id;
  return result;
end
$$;

create or replace function api.create_client(
  p_actor_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_correlation_id uuid,
  p_client jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  return app_private.create_client_owned(
    p_actor_id, p_idempotency_key, p_request_fingerprint, p_correlation_id, p_client, null
  );
end
$$;

create or replace function app_private.create_service_address_owned(
  p_actor_id uuid,
  p_correlation_id uuid,
  p_address jsonb,
  p_authorization_region_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid := coalesce((p_address->>'serviceAddressId')::uuid, gen_random_uuid());
begin
  if p_authorization_region_id is null then
    if not app_private.user_has_global_permission(p_actor_id, 'master_data.write') then
      raise exception 'permission denied' using errcode = '42501';
    end if;
  elsif not app_private.user_has_region_permission(
      p_actor_id, 'website_intake.activate', p_authorization_region_id
    ) or not app_private.user_has_region_permission(
      p_actor_id, 'master_data.write', p_authorization_region_id
    ) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  insert into app_private.service_addresses(
    service_address_id, address_line_1, address_line_2, suburb, city, postal_code,
    latitude, longitude, property_type, drum_placement, access_notes,
    security_instructions, dangerous_animal, stairs_elevation_notes
  ) values (
    new_id, p_address->>'addressLine1', p_address->>'addressLine2', p_address->>'suburb',
    p_address->>'city', p_address->>'postalCode', (p_address->>'latitude')::numeric,
    (p_address->>'longitude')::numeric, p_address->>'propertyType',
    p_address->>'drumPlacement', p_address->>'accessNotes', p_address->>'securityInstructions',
    coalesce((p_address->>'dangerousAnimal')::boolean, false),
    p_address->>'stairsElevationNotes'
  );

  insert into app_private.business_audit_facts(
    action_key, actor_id, module_key, target_type, target_id, correlation_id, after_state
  ) values (
    'service_addresses.created', p_actor_id, 'service-addresses', 'service_address',
    new_id, p_correlation_id, p_address
  );
  insert into app_private.outbox_events(
    producer_module, event_name, event_version, aggregate_type, aggregate_id,
    payload, correlation_id, actor_kind, actor_id, occurred_at
  ) values (
    'service-addresses', 'ServiceAddresses.ServiceAddressCreated', 1, 'service-address',
    new_id, jsonb_build_object('serviceAddressId', new_id), p_correlation_id,
    'user', p_actor_id::text, now()
  );
  return jsonb_build_object('serviceAddressId', new_id);
end
$$;

create or replace function api.create_service_address(
  p_actor_id uuid,
  p_correlation_id uuid,
  p_address jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  return app_private.create_service_address_owned(p_actor_id, p_correlation_id, p_address, null);
end
$$;

create or replace function app_private.create_client_service_owned(
  p_actor_id uuid,
  p_correlation_id uuid,
  p_service jsonb,
  p_authorization_region_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid := coalesce((p_service->>'clientServiceId')::uuid, gen_random_uuid());
begin
  if p_authorization_region_id is null then
    if not app_private.user_has_global_permission(p_actor_id, 'master_data.write') then
      raise exception 'permission denied' using errcode = '42501';
    end if;
  elsif not app_private.user_has_region_permission(
      p_actor_id, 'website_intake.activate', p_authorization_region_id
    ) or not app_private.user_has_region_permission(
      p_actor_id, 'master_data.write', p_authorization_region_id
    ) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  insert into app_private.client_services(
    client_service_id, client_id, service_address_id, lifecycle_status,
    service_start_date, service_end_date, cadence_code
  ) values (
    new_id, (p_service->>'clientId')::uuid, (p_service->>'serviceAddressId')::uuid,
    coalesce(p_service->>'lifecycleStatus', 'pending'),
    (p_service->>'serviceStartDate')::date, (p_service->>'serviceEndDate')::date,
    coalesce(p_service->>'cadenceCode', 'weekly')
  );
  insert into app_private.business_audit_facts(
    action_key, actor_id, module_key, target_type, target_id, correlation_id, after_state
  ) values (
    'client_services.created', p_actor_id, 'clients', 'client_service', new_id,
    p_correlation_id, p_service
  );
  return jsonb_build_object('clientServiceId', new_id);
end
$$;

create or replace function api.create_client_service(
  p_actor_id uuid,
  p_correlation_id uuid,
  p_service jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  return app_private.create_client_service_owned(p_actor_id, p_correlation_id, p_service, null);
end
$$;

revoke all on function app_private.create_client_owned(uuid,text,text,uuid,jsonb,uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.create_service_address_owned(uuid,uuid,jsonb,uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.create_client_service_owned(uuid,uuid,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.create_client_owned(uuid,text,text,uuid,jsonb,uuid) to service_role;
grant execute on function app_private.create_service_address_owned(uuid,uuid,jsonb,uuid) to service_role;
grant execute on function app_private.create_client_service_owned(uuid,uuid,jsonb,uuid) to service_role;

create or replace function api.website_intake_activate(
  p_actor_id uuid,
  p_submission_id uuid,
  p_expected_version integer,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app_private.website_intake_submissions%rowtype;
  d jsonb;
  approved_region_id uuid;
  client_id uuid;
  address_id uuid;
  service_id uuid;
  config_id uuid;
  client_result jsonb;
  address_result jsonb;
  service_result jsonb;
  config_result jsonb;
begin
  select * into s
  from app_private.website_intake_submissions
  where website_intake_submission_id = p_submission_id
  for update;
  if s.website_intake_submission_id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  perform app_private.website_intake_require(
    p_actor_id, 'website_intake.activate', s.service_region_id
  );
  if s.lifecycle_status = 'activated' then
    return jsonb_build_object(
      'submissionId', p_submission_id,
      'status', 'activated',
      'duplicate', true,
      'clientId', s.activation_client_id,
      'serviceAddressId', s.activation_service_address_id,
      'clientServiceId', s.activation_client_service_id,
      'serviceConfigurationId', s.activation_service_configuration_id
    );
  end if;
  if s.version <> p_expected_version then
    raise exception 'stale_review' using errcode = '40001';
  end if;
  if s.lifecycle_status <> 'approved' then
    raise exception 'intake_not_approved' using errcode = '55000';
  end if;

  d := s.approved_decision;
  approved_region_id := nullif(d->>'serviceRegionId', '')::uuid;
  if approved_region_id is null
     or (s.service_region_id is not null and approved_region_id is distinct from s.service_region_id) then
    raise exception 'invalid_activation_region' using errcode = '22023';
  end if;
  perform app_private.require_master_data_access(
    p_actor_id, 'master_data.write', approved_region_id
  );

  update app_private.website_intake_submissions
  set lifecycle_status = 'activating', updated_at = now()
  where website_intake_submission_id = p_submission_id;

  client_id := nullif(d->>'existingClientId', '')::uuid;
  if client_id is null then
    client_id := gen_random_uuid();
    client_result := app_private.create_client_owned(
      p_actor_id,
      'website-intake:' || p_submission_id::text || ':client',
      s.request_fingerprint,
      p_correlation_id,
      jsonb_build_object(
        'clientId', client_id,
        'clientType', coalesce(s.normalized_data->>'clientType', 'individual'),
        'displayName', s.normalized_data->>'displayName',
        'organisationName', s.normalized_data->>'organisationName',
        'lifecycleStatus', 'active'
      ),
      approved_region_id
    );
    client_id := (client_result->>'clientId')::uuid;

    perform api.master_data_create(
      p_actor_id,
      'client-contacts',
      gen_random_uuid(),
      jsonb_strip_nulls(jsonb_build_object(
        'service_region_id', approved_region_id,
        'client_id', client_id,
        'contact_name', s.normalized_data->>'contactName',
        'mobile_e164', s.normalized_data->>'mobileE164',
        'email', s.normalized_data->>'email',
        'preferred_language', coalesce(s.normalized_data->>'preferredLanguage', 'english'),
        'is_primary', true,
        'is_active', true
      )),
      'website-intake:' || p_submission_id::text || ':contact',
      s.request_fingerprint,
      p_correlation_id
    );
  end if;

  address_id := nullif(d->>'existingServiceAddressId', '')::uuid;
  if address_id is null then
    address_id := gen_random_uuid();
    address_result := app_private.create_service_address_owned(
      p_actor_id,
      p_correlation_id,
      jsonb_strip_nulls(jsonb_build_object(
        'serviceAddressId', address_id,
        'addressLine1', s.source_payload->'address'->>'addressLine1',
        'addressLine2', s.source_payload->'address'->>'addressLine2',
        'suburb', s.source_payload->'address'->>'suburb',
        'city', s.source_payload->'address'->>'city',
        'postalCode', s.source_payload->'address'->>'postalCode',
        'latitude', s.source_payload->'address'->>'latitude',
        'longitude', s.source_payload->'address'->>'longitude'
      )),
      approved_region_id
    );
    address_id := (address_result->>'serviceAddressId')::uuid;
  end if;

  service_id := gen_random_uuid();
  service_result := app_private.create_client_service_owned(
    p_actor_id,
    p_correlation_id,
    jsonb_build_object(
      'clientServiceId', service_id,
      'clientId', client_id,
      'serviceAddressId', address_id,
      'lifecycleStatus', 'active',
      'serviceStartDate', d->>'effectiveStartDate',
      'cadenceCode', 'weekly'
    ),
    approved_region_id
  );
  service_id := (service_result->>'clientServiceId')::uuid;

  config_result := api.configure_service(
    p_actor_id,
    p_correlation_id,
    jsonb_strip_nulls(jsonb_build_object(
      'clientServiceId', service_id,
      'serviceRegionId', approved_region_id,
      'territoryId', d->>'territoryId',
      'depotId', d->>'depotId',
      'defaultTeamId', d->>'defaultTeamId',
      'configuredDrumCount', d->>'approvedDrumCount',
      'operationalDrumUnitCount', d->>'approvedDrumCount',
      'configuredCollectionDay', d->>'collectionDay',
      'effectiveFrom', d->>'effectiveStartDate'
    ))
  );
  config_id := (config_result->>'serviceConfigurationId')::uuid;

  insert into app_private.external_references(
    source_system, entity_type, internal_entity_id, external_identifier
  ) values
    (s.source_system, 'website-intake', p_submission_id, s.source_submission_id),
    (s.source_system, 'client', client_id,
      coalesce(s.source_payload->'references'->>'customerReference', s.source_submission_id)),
    (s.source_system, 'client-service', service_id,
      coalesce(s.source_payload->'references'->>'serviceReference', s.source_submission_id || ':service'))
  on conflict do nothing;

  update app_private.website_intake_submissions
  set lifecycle_status = 'activated',
      activation_client_id = client_id,
      activation_service_address_id = address_id,
      activation_client_service_id = service_id,
      activation_service_configuration_id = config_id,
      version = version + 1,
      updated_at = now()
  where website_intake_submission_id = p_submission_id;

  insert into app_private.business_audit_facts(
    action_key, actor_id, module_key, target_type, target_id, correlation_id, after_state
  ) values (
    'website_intake.activated', p_actor_id, 'website-intake', 'website-intake',
    p_submission_id, p_correlation_id,
    jsonb_build_object(
      'clientId', client_id,
      'serviceAddressId', address_id,
      'clientServiceId', service_id,
      'serviceConfigurationId', config_id
    )
  );
  insert into app_private.outbox_events(
    producer_module, event_name, event_version, aggregate_type, aggregate_id,
    payload, correlation_id, actor_kind, actor_id, occurred_at
  ) values (
    'website-intake', 'WebsiteIntake.Activated', 1, 'website-intake', p_submission_id,
    jsonb_build_object(
      'submissionId', p_submission_id,
      'clientId', client_id,
      'serviceAddressId', address_id,
      'clientServiceId', service_id
    ),
    p_correlation_id, 'user', p_actor_id::text, now()
  );

  return jsonb_build_object(
    'submissionId', p_submission_id,
    'status', 'activated',
    'duplicate', false,
    'clientId', client_id,
    'serviceAddressId', address_id,
    'clientServiceId', service_id,
    'serviceConfigurationId', config_id
  );
end
$$;

comment on function api.website_intake_activate(uuid,uuid,integer,uuid) is
  'Activates one frozen Website Intake decision transactionally. Regional creation is limited to the approved intake region and does not relax ordinary global master-data creation.';
