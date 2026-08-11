-- Phase 1B authenticated Office administration boundary.
-- Resource names and mutable columns are deliberately fixed; this is not an arbitrary-table API.

create or replace function api.office_user_context(p_actor_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', profile.user_id,
    'display_name', profile.display_name,
    'roles', coalesce((select jsonb_agg(distinct role.role_key) from app_private.user_roles ur join app_private.roles role on role.role_id=ur.role_id where ur.user_id=profile.user_id),'[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(distinct rp.permission_key) from app_private.user_roles ur join app_private.role_permissions rp on rp.role_id=ur.role_id where ur.user_id=profile.user_id),'[]'::jsonb),
    'service_region_ids', coalesce((select jsonb_agg(scope.scope_id) from app_private.user_access_scopes scope where scope.user_id=profile.user_id and scope.scope_kind='service_region'),'[]'::jsonb),
    'global_access', exists(select 1 from app_private.user_access_scopes scope where scope.user_id=profile.user_id and scope.scope_kind='global')
  ) from public.user_profiles profile where profile.user_id=p_actor_id and profile.is_active;
$$;

create or replace function app_private.master_data_table(p_resource text)
returns text language sql immutable set search_path='' as $$
  select case p_resource
    when 'clients' then 'clients' when 'client-contacts' then 'client_contacts'
    when 'service-addresses' then 'service_addresses' when 'client-services' then 'client_services'
    when 'service-configurations' then 'service_configurations' when 'service-regions' then 'service_regions'
    when 'depots' then 'depots' when 'territories' then 'territories' when 'teams' then 'teams'
    when 'staff' then 'staff' when 'vehicles' then 'vehicles' end;
$$;

create or replace function app_private.master_data_id_column(p_resource text)
returns text language sql immutable set search_path='' as $$
  select case p_resource
    when 'clients' then 'client_id' when 'client-contacts' then 'client_contact_id'
    when 'service-addresses' then 'service_address_id' when 'client-services' then 'client_service_id'
    when 'service-configurations' then 'service_configuration_id' when 'service-regions' then 'service_region_id'
    when 'depots' then 'depot_id' when 'territories' then 'territory_id' when 'teams' then 'team_id'
    when 'staff' then 'staff_id' when 'vehicles' then 'vehicle_id' end;
$$;

create or replace function app_private.master_data_columns(p_resource text)
returns text[] language sql immutable set search_path='' as $$
  select case p_resource
    when 'clients' then array['client_type','display_name','legal_name','organisation_name','company_registration_number','south_african_id_number','lifecycle_status']
    when 'client-contacts' then array['client_id','contact_name','mobile_e164','email','preferred_language','is_primary','is_active']
    when 'service-addresses' then array['address_line_1','address_line_2','suburb','city','postal_code','latitude','longitude','geocoding_status','validation_status','manual_review_required','property_type','drum_placement','access_notes','security_instructions','dangerous_animal','stairs_elevation_notes']
    when 'client-services' then array['client_id','service_address_id','lifecycle_status','service_start_date','service_end_date','cadence_code']
    when 'service-configurations' then array['client_service_id','service_region_id','territory_id','territory_is_override','depot_id','default_team_id','configured_drum_count','operational_drum_unit_count','configured_collection_day','access_configuration','effective_from']
    when 'service-regions' then array['name','region_code','default_timezone','is_active']
    when 'depots' then array['service_region_id','name','address_line_1','address_line_2','suburb','city','postal_code','latitude','longitude','geofence_radius_metres','operating_configuration','is_active']
    when 'territories' then array['service_region_id','name','priority','default_depot_id','preferred_collection_days','service_status','is_active']
    when 'teams' then array['service_region_id','default_depot_id','team_code','name','normal_vehicle_id','working_hours','route_eligibility','is_active']
    when 'staff' then array['user_id','display_name','mobile_e164','operational_role','default_team_id','availability_configuration','is_active']
    when 'vehicles' then array['service_region_id','default_depot_id','default_team_id','registration_reference','display_name','operational_availability','estimated_drum_capacity','working_hours','after_hours_grace_minutes','current_odometer_km','maintenance_configuration','compliance_metadata','is_active']
  end;
$$;

create or replace function app_private.require_master_data_access(p_actor_id uuid,p_permission text,p_region_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$ begin
  if p_region_id is null then
    if not app_private.user_has_global_permission(p_actor_id,p_permission) then raise exception 'permission denied' using errcode='42501'; end if;
  elsif not app_private.user_has_region_permission(p_actor_id,p_permission,p_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
end $$;

create or replace function app_private.require_master_data_entity_access(p_actor_id uuid,p_permission text,p_resource text,p_entity_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare allowed boolean:=false;
begin
  if app_private.user_has_global_permission(p_actor_id,p_permission) then return; end if;
  if p_resource='service-regions' then allowed:=app_private.user_has_region_permission(p_actor_id,p_permission,p_entity_id);
  elsif p_resource in ('depots','territories','teams','vehicles','service-configurations') then
    execute format('select app_private.user_has_region_permission($1,$2,service_region_id) from app_private.%I where %I=$3',app_private.master_data_table(p_resource),app_private.master_data_id_column(p_resource)) using p_actor_id,p_permission,p_entity_id into allowed;
  elsif p_resource='staff' then
    select app_private.user_has_region_permission(p_actor_id,p_permission,team.service_region_id) into allowed from app_private.staff staff join app_private.teams team on team.team_id=staff.default_team_id where staff.staff_id=p_entity_id;
  elsif p_resource='clients' then
    select bool_or(app_private.user_has_region_permission(p_actor_id,p_permission,configuration.service_region_id)) into allowed from app_private.client_services service join app_private.service_configurations configuration on configuration.client_service_id=service.client_service_id and configuration.effective_to is null where service.client_id=p_entity_id;
  elsif p_resource='client-contacts' then
    select bool_or(app_private.user_has_region_permission(p_actor_id,p_permission,configuration.service_region_id)) into allowed from app_private.client_contacts contact join app_private.client_services service on service.client_id=contact.client_id join app_private.service_configurations configuration on configuration.client_service_id=service.client_service_id and configuration.effective_to is null where contact.client_contact_id=p_entity_id;
  elsif p_resource='service-addresses' then
    select bool_or(app_private.user_has_region_permission(p_actor_id,p_permission,configuration.service_region_id)) into allowed from app_private.client_services service join app_private.service_configurations configuration on configuration.client_service_id=service.client_service_id and configuration.effective_to is null where service.service_address_id=p_entity_id;
  elsif p_resource='client-services' then
    select bool_or(app_private.user_has_region_permission(p_actor_id,p_permission,configuration.service_region_id)) into allowed from app_private.service_configurations configuration where configuration.client_service_id=p_entity_id and configuration.effective_to is null;
  end if;
  if not coalesce(allowed,false) then raise exception 'permission denied' using errcode='42501'; end if;
end $$;

create or replace function app_private.begin_master_data_command(p_operation text,p_key text,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare reserved boolean; existing app_private.idempotency_records%rowtype;
begin
  insert into app_private.idempotency_records(operation_key,idempotency_key,request_fingerprint,expires_at)
    values(p_operation,p_key,p_fingerprint,now()+interval '30 days') on conflict do nothing returning true into reserved;
  if coalesce(reserved,false) then return null; end if;
  select * into existing from app_private.idempotency_records where operation_key=p_operation and idempotency_key=p_key for update;
  if existing.request_fingerprint<>p_fingerprint then raise exception 'idempotency_key_reused' using errcode='P0001'; end if;
  if existing.processing_status='completed' then return existing.response_body; end if;
  raise exception 'idempotency_in_progress' using errcode='55P03';
end $$;

create or replace function app_private.complete_master_data_command(p_operation text,p_key text,p_result jsonb)
returns void language sql security definer set search_path='' as $$
  update app_private.idempotency_records set processing_status='completed',response_status=200,response_body=p_result,completed_at=now()
  where operation_key=p_operation and idempotency_key=p_key;
$$;

create or replace function api.master_data_list(p_actor_id uuid,p_resource text,p_query jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tbl text:=app_private.master_data_table(p_resource); region_id uuid:=(p_query->>'service_region_id')::uuid; result jsonb; page_no int:=coalesce((p_query->>'page')::int,1); page_size int:=coalesce((p_query->>'page_size')::int,25); search_text text:=nullif(p_query->>'search',''); region_filter text:='true';
begin
  if tbl is null then raise exception 'not found' using errcode='P0002'; end if;
  perform app_private.require_master_data_access(p_actor_id,case when p_resource in ('clients','client-contacts') then 'clients.sensitive.read' else 'master_data.read' end,region_id);
  if region_id is not null then
    region_filter:=case
      when p_resource in ('service-regions','depots','territories','teams','vehicles','service-configurations') then format('%I.service_region_id=$4',tbl)
      when p_resource='staff' then 'exists(select 1 from app_private.teams scope_team where scope_team.team_id=staff.default_team_id and scope_team.service_region_id=$4)'
      when p_resource='clients' then 'exists(select 1 from app_private.client_services scope_service join app_private.service_configurations scope_config on scope_config.client_service_id=scope_service.client_service_id and scope_config.effective_to is null where scope_service.client_id=clients.client_id and scope_config.service_region_id=$4)'
      when p_resource='client-contacts' then 'exists(select 1 from app_private.client_services scope_service join app_private.service_configurations scope_config on scope_config.client_service_id=scope_service.client_service_id and scope_config.effective_to is null where scope_service.client_id=client_contacts.client_id and scope_config.service_region_id=$4)'
      when p_resource='service-addresses' then 'exists(select 1 from app_private.client_services scope_service join app_private.service_configurations scope_config on scope_config.client_service_id=scope_service.client_service_id and scope_config.effective_to is null where scope_service.service_address_id=service_addresses.service_address_id and scope_config.service_region_id=$4)'
      when p_resource='client-services' then 'exists(select 1 from app_private.service_configurations scope_config where scope_config.client_service_id=client_services.client_service_id and scope_config.effective_to is null and scope_config.service_region_id=$4)'
      else 'false' end;
  end if;
  execute format('select jsonb_build_object(''items'',coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb),''page'',$2,''page_size'',$3,''total'',count(*)) from (select * from app_private.%I where ($1 is null or to_jsonb(%I)::text ilike ''%%''||$1||''%%'') and %s order by updated_at desc limit $3 offset (($2-1)*$3)) x',tbl,tbl,region_filter)
    using search_text,page_no,page_size,region_id into result;
  return coalesce(result,jsonb_build_object('items','[]'::jsonb,'page',page_no,'page_size',page_size,'total',0));
end $$;

create or replace function api.master_data_get(p_actor_id uuid,p_resource text,p_entity_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tbl text:=app_private.master_data_table(p_resource); id_col text:=app_private.master_data_id_column(p_resource); result jsonb;
begin
  if tbl is null then raise exception 'not found' using errcode='P0002'; end if;
  perform app_private.require_master_data_entity_access(p_actor_id,case when p_resource in ('clients','client-contacts') then 'clients.sensitive.read' else 'master_data.read' end,p_resource,p_entity_id);
  execute format('select to_jsonb(t) from app_private.%I t where %I=$1',tbl,id_col) using p_entity_id into result;
  if result is null then raise exception 'not found' using errcode='P0002'; end if; return result;
end $$;

create or replace function api.master_data_create(p_actor_id uuid,p_resource text,p_entity_id uuid,p_body jsonb,p_idempotency_key text,p_request_fingerprint text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tbl text:=app_private.master_data_table(p_resource); id_col text:=app_private.master_data_id_column(p_resource); allowed text[]:=app_private.master_data_columns(p_resource); supplied text[]; cols text; vals text; result jsonb; new_id uuid:=coalesce(p_entity_id,gen_random_uuid()); region_id uuid:=(p_body->>'service_region_id')::uuid; previous_count integer;
begin
  if tbl is null then raise exception 'not found' using errcode='P0002'; end if;
  perform app_private.require_master_data_access(p_actor_id,'master_data.write',region_id);
  result:=app_private.begin_master_data_command('master_data.'||replace(p_resource,'-','_')||'.create',p_idempotency_key,p_request_fingerprint);
  if result is not null then return result; end if;
  if p_resource='service-configurations' then
    select configured_drum_count into previous_count from app_private.service_configurations where client_service_id=(p_body->>'client_service_id')::uuid and effective_to is null for update;
    update app_private.service_configurations set effective_to=(p_body->>'effective_from')::date-1,updated_at=now() where client_service_id=(p_body->>'client_service_id')::uuid and effective_to is null;
  end if;
  select array_agg(key order by key) into supplied from jsonb_object_keys(p_body) as keys(key) where key=any(allowed);
  cols:=array_to_string(array(select format('%I',x) from unnest(coalesce(supplied,'{}')) x),',');
  vals:=array_to_string(array(select format('(jsonb_populate_record(null::app_private.%I,$1)).%I',tbl,x) from unnest(coalesce(supplied,'{}')) x),',');
  execute format('insert into app_private.%I (%I%s) select $2%s returning to_jsonb(%I.*)',tbl,id_col,case when cols<>'' then ','||cols else '' end,case when vals<>'' then ','||vals else '' end,tbl) using p_body,new_id into result;
  insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values(replace(p_resource,'-','_')||'.created',p_actor_id,case when p_resource='vehicles' then 'vehicles' when p_resource in ('clients','client-contacts','client-services') then 'clients' else 'geography' end,p_resource,new_id,p_correlation_id,result);
  if p_resource in ('clients','service-addresses','service-configurations') then
    insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at)
    values(case when p_resource='clients' then 'clients' when p_resource='service-addresses' then 'service-addresses' else 'service-configuration' end,
      case when p_resource='clients' then 'Clients.ClientCreated' when p_resource='service-addresses' then 'ServiceAddresses.ServiceAddressCreated' when previous_count is distinct from null and previous_count is distinct from (p_body->>'configured_drum_count')::integer then 'ServiceConfiguration.DrumCountChanged' else 'ServiceConfiguration.ServiceConfigured' end,
      1,case when p_resource='clients' then 'client' when p_resource='service-addresses' then 'service-address' else 'client-service' end,case when p_resource='service-configurations' then (p_body->>'client_service_id')::uuid else new_id end,
      case when p_resource='clients' then jsonb_build_object('clientId',new_id) when p_resource='service-addresses' then jsonb_build_object('serviceAddressId',new_id) else jsonb_build_object('clientServiceId',(p_body->>'client_service_id')::uuid,'configuredDrumCount',(p_body->>'configured_drum_count')::integer,'previousDrumCount',previous_count) end,
      p_correlation_id,'user',p_actor_id::text,now());
  end if;
  perform app_private.complete_master_data_command('master_data.'||replace(p_resource,'-','_')||'.create',p_idempotency_key,result);
  return result;
end $$;

create or replace function api.master_data_update(p_actor_id uuid,p_resource text,p_entity_id uuid,p_body jsonb,p_idempotency_key text,p_request_fingerprint text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tbl text:=app_private.master_data_table(p_resource); id_col text:=app_private.master_data_id_column(p_resource); allowed text[]:=app_private.master_data_columns(p_resource); assignments text; before_row jsonb; result jsonb; expected timestamptz:=(p_body->>'expected_updated_at')::timestamptz; region_id uuid:=(p_body->>'service_region_id')::uuid;
begin
  if tbl is null then raise exception 'not found' using errcode='P0002'; end if;
  if region_id is null then perform app_private.require_master_data_entity_access(p_actor_id,'master_data.write',p_resource,p_entity_id); else perform app_private.require_master_data_access(p_actor_id,'master_data.write',region_id); end if;
  result:=app_private.begin_master_data_command('master_data.'||replace(p_resource,'-','_')||'.update.'||p_entity_id::text,p_idempotency_key,p_request_fingerprint);
  if result is not null then return result; end if;
  if p_resource='service-configurations' then raise exception 'effective_dated_configuration_requires_new_version' using errcode='P0001'; end if;
  execute format('select to_jsonb(t) from app_private.%I t where %I=$1 for update',tbl,id_col) using p_entity_id into before_row;
  if before_row is null then raise exception 'not found' using errcode='P0002'; end if;
  if expected is null or (before_row->>'updated_at')::timestamptz<>expected then raise exception 'stale_update' using errcode='40001'; end if;
  select string_agg(format('%I=(jsonb_populate_record(null::app_private.%I,$1)).%I',key,tbl,key),',') into assignments from jsonb_object_keys(p_body) as keys(key) where key=any(allowed);
  if assignments is null then return before_row; end if;
  execute format('update app_private.%I set %s,updated_at=now() where %I=$2 returning to_jsonb(%I.*)',tbl,assignments,id_col,tbl) using p_body,p_entity_id into result;
  insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,before_state,after_state) values(replace(p_resource,'-','_')||'.updated',p_actor_id,case when p_resource='vehicles' then 'vehicles' when p_resource in ('clients','client-contacts','client-services') then 'clients' else 'geography' end,p_resource,p_entity_id,p_correlation_id,before_row,result);
  if p_resource='service-addresses' or (p_resource='vehicles' and before_row->>'operational_availability' is distinct from result->>'operational_availability') then
    insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at)
    values(case when p_resource='vehicles' then 'vehicles' else 'service-addresses' end,case when p_resource='vehicles' then 'Vehicles.VehicleAvailabilityChanged' else 'ServiceAddresses.ServiceAddressChanged' end,1,
      case when p_resource='vehicles' then 'vehicle' else 'service-address' end,p_entity_id,
      case when p_resource='vehicles' then jsonb_build_object('vehicleId',p_entity_id,'previousAvailability',before_row->>'operational_availability','availability',result->>'operational_availability') else jsonb_build_object('serviceAddressId',p_entity_id) end,
      p_correlation_id,'user',p_actor_id::text,now());
  end if;
  perform app_private.complete_master_data_command('master_data.'||replace(p_resource,'-','_')||'.update.'||p_entity_id::text,p_idempotency_key,result);
  return result;
end $$;

create or replace function api.master_data_archive(p_actor_id uuid,p_resource text,p_entity_id uuid,p_body jsonb,p_idempotency_key text,p_request_fingerprint text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tbl text:=app_private.master_data_table(p_resource); id_col text:=app_private.master_data_id_column(p_resource); before_row jsonb; result jsonb; expected timestamptz:=(p_body->>'expected_updated_at')::timestamptz; set_clause text;
begin
  if tbl is null then raise exception 'not found' using errcode='P0002'; end if; perform app_private.require_master_data_entity_access(p_actor_id,'master_data.write',p_resource,p_entity_id);
  result:=app_private.begin_master_data_command('master_data.'||replace(p_resource,'-','_')||'.archive.'||p_entity_id::text,p_idempotency_key,p_request_fingerprint);
  if result is not null then return result; end if;
  execute format('select to_jsonb(t) from app_private.%I t where %I=$1 for update',tbl,id_col) using p_entity_id into before_row;
  if before_row is null then raise exception 'not found' using errcode='P0002'; end if;
  if expected is null or (before_row->>'updated_at')::timestamptz<>expected then raise exception 'stale_update' using errcode='40001'; end if;
  set_clause:=case when p_resource in ('clients','client-services') then 'lifecycle_status=''archived'',archived_at=now()' when p_resource='service-addresses' then 'archived_at=now()' when p_resource='vehicles' then 'operational_availability=''retired'',is_active=false' else 'is_active=false' end;
  execute format('update app_private.%I set %s,updated_at=now() where %I=$1 returning to_jsonb(%I.*)',tbl,set_clause,id_col,tbl) using p_entity_id into result;
  insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,before_state,after_state) values(replace(p_resource,'-','_')||'.archived',p_actor_id,'audit',p_resource,p_entity_id,p_correlation_id,before_row,result);
  perform app_private.complete_master_data_command('master_data.'||replace(p_resource,'-','_')||'.archive.'||p_entity_id::text,p_idempotency_key,result);
  return result;
end $$;

revoke all on function api.office_user_context(uuid),api.master_data_list(uuid,text,jsonb),api.master_data_get(uuid,text,uuid),api.master_data_create(uuid,text,uuid,jsonb,text,text,uuid),api.master_data_update(uuid,text,uuid,jsonb,text,text,uuid),api.master_data_archive(uuid,text,uuid,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function api.office_user_context(uuid),api.master_data_list(uuid,text,jsonb),api.master_data_get(uuid,text,uuid),api.master_data_create(uuid,text,uuid,jsonb,text,text,uuid),api.master_data_update(uuid,text,uuid,jsonb,text,text,uuid),api.master_data_archive(uuid,text,uuid,jsonb,text,text,uuid) to service_role;
