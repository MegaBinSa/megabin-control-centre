-- Phase 4A Website Onboarding integration and client-intake foundation.

alter table app_private.outbox_events drop constraint outbox_events_producer_module_check;
alter table app_private.outbox_events add constraint outbox_events_producer_module_check check (
  producer_module in ('identity-access','clients','service-addresses','service-configuration','geography','workforce','vehicles','daily-roster','routes','route-operations','vehicle-tracking','operational-intelligence','operational-issues','needs-attention','communications','integrations','configuration','reporting','audit','system-health','website-intake')
);

insert into app_private.permissions(permission_key,description) values
 ('website_intake.read','Read website onboarding intake in an allowed region.'),
 ('website_intake.review','Review matching and suggestions for website intake.'),
 ('website_intake.approve','Approve a frozen website intake activation decision.'),
 ('website_intake.reject','Reject website intake with a reason.'),
 ('website_intake.activate','Activate approved intake through owning master-data boundaries.'),
 ('website_intake.integration.manage','Manage the website onboarding integration registration.')
on conflict do nothing;

insert into app_private.role_permissions(role_id,permission_key)
select r.role_id,p.permission_key from app_private.roles r cross join app_private.permissions p
where r.role_key in ('director_admin','operations_manager') and p.permission_key like 'website_intake.%'
on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
select r.role_id,p.permission_key from app_private.roles r cross join app_private.permissions p
where r.role_key='office_admin' and p.permission_key in ('website_intake.read','website_intake.review','website_intake.approve','website_intake.reject','website_intake.activate')
on conflict do nothing;

insert into app_private.integration_registrations(
 integration_key,provider_key,capability_key,environment_name,lifecycle_status,integration_mode,
 permitted_inbound_fields,permitted_outbound_events,authentication_reference
) values
 ('megabin-website-onboarding-local','megabin_website','website-onboarding','local','enabled','test',array['sourceSubmissionId','payloadVersion','submittedAt','client','contact','address','requestedDrumCount','requestedStartDate','references','consent'],array['WebsiteIntake.SubmissionReceived'],'MEGABIN_WEBSITE_ONBOARDING_SECRET'),
 ('megabin-website-onboarding-staging','megabin_website','website-onboarding','staging','enabled','test',array['sourceSubmissionId','payloadVersion','submittedAt','client','contact','address','requestedDrumCount','requestedStartDate','references','consent'],array['WebsiteIntake.SubmissionReceived'],'MEGABIN_WEBSITE_ONBOARDING_SECRET'),
 ('megabin-website-onboarding-production','megabin_website','website-onboarding','production','configured','live',array['sourceSubmissionId','payloadVersion','submittedAt','client','contact','address','requestedDrumCount','requestedStartDate','references','consent'],array['WebsiteIntake.SubmissionReceived'],'MEGABIN_WEBSITE_ONBOARDING_SECRET')
on conflict(integration_key) do nothing;

create table app_private.website_intake_submissions (
 website_intake_submission_id uuid primary key default gen_random_uuid(),
 integration_id uuid not null references app_private.integration_registrations,
 source_system text not null check(source_system ~ '^[a-z][a-z0-9_.-]*$'),
 source_submission_id text not null check(char_length(source_submission_id) between 1 and 200),
 payload_version text not null check(char_length(payload_version) between 1 and 20),
 source_submitted_at timestamptz not null,
 server_received_at timestamptz not null default now(),
 idempotency_key text not null check(char_length(idempotency_key) between 1 and 200),
 request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 correlation_id uuid not null,
 lifecycle_status text not null default 'received' check(lifecycle_status in ('received','validating','invalid','processing','needs_review','approved','rejected','activating','activated','failed')),
 source_payload jsonb not null check(jsonb_typeof(source_payload)='object'),
 normalized_data jsonb check(normalized_data is null or jsonb_typeof(normalized_data)='object'),
 processing_version text,
 duplicate_classification text not null default 'none' check(duplicate_classification in ('none','transport_retry','duplicate_form','existing_client_repeat','same_property_new_service','changed_payload_conflict','active_service_duplicate')),
 match_status text not null default 'not_evaluated' check(match_status in ('not_evaluated','no_match','strong_match','ambiguous_match','conflict')),
 review_status text not null default 'not_reviewed' check(review_status in ('not_reviewed','required','approved','rejected')),
 decision jsonb check(decision is null or jsonb_typeof(decision)='object'),
 approved_decision jsonb check(approved_decision is null or jsonb_typeof(approved_decision)='object'),
 validation_errors jsonb not null default '[]' check(jsonb_typeof(validation_errors)='array'),
 rejection_reason text check(rejection_reason is null or char_length(rejection_reason) between 3 and 1000),
 service_region_id uuid references app_private.service_regions,
 activation_client_id uuid references app_private.clients,
 activation_service_address_id uuid references app_private.service_addresses,
 activation_client_service_id uuid references app_private.client_services,
 activation_service_configuration_id uuid references app_private.service_configurations,
 version integer not null default 1 check(version > 0),
 processing_attempts integer not null default 0 check(processing_attempts >= 0),
 last_failure_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(integration_id,source_submission_id),
 unique(integration_id,idempotency_key)
);

create table app_private.website_intake_processing_history (
 website_intake_processing_history_id uuid primary key default gen_random_uuid(),
 website_intake_submission_id uuid not null references app_private.website_intake_submissions on delete cascade,
 processing_version text not null,
 lifecycle_status text not null,
 normalized_data jsonb,
 decision jsonb,
 safe_errors jsonb not null default '[]',
 created_at timestamptz not null default now()
);

create table app_private.website_intake_reviews (
 website_intake_review_id uuid primary key default gen_random_uuid(),
 website_intake_submission_id uuid not null references app_private.website_intake_submissions,
 actor_id uuid not null references auth.users,
 action text not null check(action in ('match_decision','approved','rejected','activation_retry')),
 reason text,
 decision jsonb,
 created_at timestamptz not null default now()
);

create index website_intake_queue_idx on app_private.website_intake_submissions(lifecycle_status,server_received_at desc);
create index website_intake_region_queue_idx on app_private.website_intake_submissions(service_region_id,lifecycle_status,server_received_at desc);
create index website_intake_match_mobile_idx on app_private.client_contacts(mobile_e164) where is_active;
create index website_intake_match_email_idx on app_private.client_contacts(lower(email)) where is_active and email is not null;
create index website_intake_address_exact_idx on app_private.service_addresses(lower(address_line_1),lower(suburb),lower(city)) where archived_at is null;

alter table app_private.website_intake_submissions enable row level security;
alter table app_private.website_intake_processing_history enable row level security;
alter table app_private.website_intake_reviews enable row level security;
revoke all on app_private.website_intake_submissions,app_private.website_intake_processing_history,app_private.website_intake_reviews from public,anon,authenticated;
grant select,insert,update on app_private.website_intake_submissions,app_private.website_intake_processing_history,app_private.website_intake_reviews to service_role;

create or replace function app_private.website_intake_require(p_actor_id uuid,p_permission text,p_region_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_actor_id is null or not app_private.user_has_region_permission(p_actor_id,p_permission,p_region_id) then
  raise exception 'permission denied' using errcode='42501';
 end if;
end $$;

create or replace function app_private.website_intake_public_status(p_status text)
returns text language sql immutable set search_path='' as $$
 select case p_status when 'received' then 'received' when 'validating' then 'received' when 'processing' then 'received'
  when 'needs_review' then 'under_review' when 'approved' then 'under_review' when 'activating' then 'under_review'
  when 'activated' then 'activated' when 'rejected' then 'rejected' when 'invalid' then 'rejected' when 'failed' then 'received' end;
$$;

create or replace function api.website_intake_receive(
 p_integration_key text,p_source_submission_id text,p_idempotency_key text,p_fingerprint text,
 p_correlation_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare reg app_private.integration_registrations%rowtype; existing app_private.website_intake_submissions%rowtype; new_id uuid; errors jsonb:='[]'::jsonb;
begin
 select * into reg from app_private.integration_registrations where integration_key=p_integration_key and capability_key='website-onboarding';
 if reg.integration_id is null or reg.lifecycle_status<>'enabled' then raise exception 'integration_authentication_failed' using errcode='28000'; end if;
 select * into existing from app_private.website_intake_submissions where integration_id=reg.integration_id and (source_submission_id=p_source_submission_id or idempotency_key=p_idempotency_key) for update;
 if existing.website_intake_submission_id is not null then
  if existing.request_fingerprint<>p_fingerprint then raise exception 'changed_payload_conflict' using errcode='23505'; end if;
  update app_private.website_intake_submissions set duplicate_classification='transport_retry',updated_at=now() where website_intake_submission_id=existing.website_intake_submission_id;
  insert into app_private.integration_activity_logs(integration_id,correlation_id,interaction_id,direction,outcome,safe_metadata)
  values(reg.integration_id,p_correlation_id,p_source_submission_id,'inbound','succeeded',jsonb_build_object('classification','transport_retry'));
  return jsonb_build_object('submissionId',existing.website_intake_submission_id,'acknowledgement','duplicate','status',app_private.website_intake_public_status(existing.lifecycle_status),'duplicate',true,'correlationId',existing.correlation_id);
 end if;
 if p_payload->>'payloadVersion'<>'1.0' then errors:=errors||jsonb_build_array(jsonb_build_object('field','payloadVersion','code','unsupported'));
 end if;
 if coalesce(p_payload->'contact'->>'mobile','')='' and coalesce(p_payload->'contact'->>'email','')='' then errors:=errors||jsonb_build_array(jsonb_build_object('field','contact','code','mobile_or_email_required')); end if;
 if coalesce((p_payload->>'requestedDrumCount')::integer,0)<=0 then errors:=errors||jsonb_build_array(jsonb_build_object('field','requestedDrumCount','code','positive_integer_required')); end if;
 new_id:=gen_random_uuid();
 insert into app_private.website_intake_submissions(website_intake_submission_id,integration_id,source_system,source_submission_id,payload_version,source_submitted_at,idempotency_key,request_fingerprint,correlation_id,lifecycle_status,source_payload,validation_errors)
 values(new_id,reg.integration_id,reg.provider_key,p_source_submission_id,p_payload->>'payloadVersion',(p_payload->>'submittedAt')::timestamptz,p_idempotency_key,p_fingerprint,p_correlation_id,case when jsonb_array_length(errors)>0 then 'invalid' else 'received' end,p_payload,errors);
 insert into app_private.integration_activity_logs(integration_id,correlation_id,interaction_id,direction,outcome,error_classification,safe_metadata)
 values(reg.integration_id,p_correlation_id,p_source_submission_id,'inbound',case when jsonb_array_length(errors)>0 then 'permanent_failure' else 'succeeded' end,case when jsonb_array_length(errors)>0 then 'invalid_request' end,jsonb_build_object('validationStatus',case when jsonb_array_length(errors)>0 then 'invalid' else 'accepted' end));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at)
 values('website-intake','WebsiteIntake.SubmissionReceived',1,'website-intake',new_id,jsonb_build_object('submissionId',new_id,'sourceSystem',reg.provider_key),p_correlation_id,'integration',reg.integration_id::text,now());
 return jsonb_build_object('submissionId',new_id,'acknowledgement',case when jsonb_array_length(errors)>0 then 'rejected_validation' else 'accepted' end,'status',case when jsonb_array_length(errors)>0 then 'rejected' else 'received' end,'duplicate',false,'correlationId',p_correlation_id);
end $$;

create or replace function api.website_intake_process(p_submission_id uuid,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s app_private.website_intake_submissions%rowtype; n jsonb; phone text; email_value text; candidates jsonb; addresses jsonb; territories jsonb; territory_count integer; v_territory_id uuid; region_id uuid; depot_id uuid; v_team_id uuid; collection_day smallint; active_duplicate boolean; v_decision jsonb;
begin
 select * into s from app_private.website_intake_submissions where website_intake_submission_id=p_submission_id for update;
 if s.website_intake_submission_id is null then raise exception 'not found' using errcode='P0002'; end if;
 if s.lifecycle_status='invalid' then return jsonb_build_object('submissionId',p_submission_id,'status','invalid'); end if;
 if s.lifecycle_status not in ('received','failed','processing','needs_review') then return jsonb_build_object('submissionId',p_submission_id,'status',s.lifecycle_status); end if;
 update app_private.website_intake_submissions set lifecycle_status='processing',processing_attempts=processing_attempts+1,updated_at=now() where website_intake_submission_id=p_submission_id;
 phone:=regexp_replace(coalesce(s.source_payload->'contact'->>'mobile',''),'[^0-9+]','','g');
 if phone ~ '^0[6-8][0-9]{8}$' then phone:='+27'||substring(phone from 2); elsif phone ~ '^27[6-8][0-9]{8}$' then phone:='+'||phone; end if;
 email_value:=lower(nullif(btrim(s.source_payload->'contact'->>'email'),''));
 n:=jsonb_build_object('clientType',coalesce(s.source_payload->'client'->>'type','individual'),'displayName',btrim(s.source_payload->'client'->>'displayName'),'organisationName',nullif(btrim(s.source_payload->'client'->>'organisationName'),''),'contactName',btrim(s.source_payload->'contact'->>'name'),'mobileE164',nullif(phone,''),'email',email_value,'preferredLanguage',coalesce(s.source_payload->'contact'->>'preferredLanguage','english'),'address',s.source_payload->'address','requestedDrumCount',(s.source_payload->>'requestedDrumCount')::integer,'requestedStartDate',s.source_payload->>'requestedStartDate');
 select coalesce(jsonb_agg(jsonb_build_object('clientId',c.client_id,'displayName',c.display_name,'signals',jsonb_strip_nulls(jsonb_build_object('mobile',case when cc.mobile_e164=phone then true end,'email',case when lower(cc.email)=email_value then true end))) order by c.display_name),'[]'::jsonb) into candidates
 from app_private.clients c join app_private.client_contacts cc on cc.client_id=c.client_id and cc.is_active where (phone<>'' and cc.mobile_e164=phone) or (email_value is not null and lower(cc.email)=email_value);
 select coalesce(jsonb_agg(jsonb_build_object('serviceAddressId',a.service_address_id,'addressLine1',a.address_line_1,'suburb',a.suburb,'city',a.city,'distanceMetres',case when a.location is not null and s.source_payload->'address'?'latitude' then round(extensions.st_distance(a.location,extensions.st_setsrid(extensions.st_makepoint((s.source_payload->'address'->>'longitude')::float,(s.source_payload->'address'->>'latitude')::float),4326)::extensions.geography)) end)),'[]'::jsonb) into addresses
 from app_private.service_addresses a where a.archived_at is null and ((lower(a.address_line_1)=lower(s.source_payload->'address'->>'addressLine1') and lower(a.suburb)=lower(s.source_payload->'address'->>'suburb') and lower(a.city)=lower(s.source_payload->'address'->>'city')) or (a.location is not null and s.source_payload->'address'?'latitude' and extensions.st_dwithin(a.location,extensions.st_setsrid(extensions.st_makepoint((s.source_payload->'address'->>'longitude')::float,(s.source_payload->'address'->>'latitude')::float),4326)::extensions.geography,25)));
 if s.source_payload->'address'?'latitude' then
  select count(*),(array_agg(tc.territory_id))[1],(array_agg(tc.service_region_id))[1],(array_agg(tc.default_depot_id))[1] into territory_count,v_territory_id,region_id,depot_id from app_private.territory_candidates(extensions.st_setsrid(extensions.st_makepoint((s.source_payload->'address'->>'longitude')::float,(s.source_payload->'address'->>'latitude')::float),4326)) tc;
  select coalesce(jsonb_agg(to_jsonb(tc)),'[]'::jsonb) into territories from app_private.territory_candidates(extensions.st_setsrid(extensions.st_makepoint((s.source_payload->'address'->>'longitude')::float,(s.source_payload->'address'->>'latitude')::float),4326)) tc;
 else territory_count:=0; territories:='[]'; end if;
 if territory_count=1 then select t.preferred_collection_days[1] into collection_day from app_private.territories t where t.territory_id=v_territory_id; select et.team_id into v_team_id from app_private.territory_eligible_teams et where et.territory_id=v_territory_id order by et.created_at limit 1; end if;
 select exists(select 1 from app_private.client_services cs where cs.lifecycle_status='active' and cs.client_id in (select (value->>'clientId')::uuid from jsonb_array_elements(candidates)) and cs.service_address_id in (select (value->>'serviceAddressId')::uuid from jsonb_array_elements(addresses))) into active_duplicate;
 v_decision:=jsonb_build_object('outcome','office_review_required','reasons',array_remove(array[case when jsonb_array_length(candidates)>1 then 'ambiguous_client_match' end,case when territory_count<>1 then case when territory_count=0 then 'no_service_territory' else 'ambiguous_territory' end end,case when active_duplicate then 'active_service_duplicate' end]::text[],null),'clientMatch',jsonb_build_object('status',case when jsonb_array_length(candidates)=0 then 'no_match' when jsonb_array_length(candidates)=1 then 'strong_match' else 'ambiguous_match' end,'candidates',candidates),'addressMatch',jsonb_build_object('status',case when jsonb_array_length(addresses)=0 then 'no_match' when jsonb_array_length(addresses)=1 then 'strong_match' else 'ambiguous_match' end,'candidates',addresses),'geography',jsonb_build_object('territories',territories,'suggestedTerritoryId',case when territory_count=1 then v_territory_id end,'serviceRegionId',region_id,'defaultDepotId',depot_id,'defaultTeamId',v_team_id,'collectionDay',collection_day),'submitted',n);
 update app_private.website_intake_submissions set lifecycle_status='needs_review',normalized_data=n,processing_version='phase-4a-v1',decision=v_decision,match_status=v_decision->'clientMatch'->>'status',duplicate_classification=case when active_duplicate then 'active_service_duplicate' when jsonb_array_length(addresses)>0 then 'same_property_new_service' else 'none' end,review_status='required',service_region_id=region_id,version=version+1,updated_at=now() where website_intake_submission_id=p_submission_id;
 insert into app_private.website_intake_processing_history(website_intake_submission_id,processing_version,lifecycle_status,normalized_data,decision) values(p_submission_id,'phase-4a-v1','needs_review',n,v_decision);
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('website-intake','WebsiteIntake.ReviewRequired',1,'website-intake',p_submission_id,jsonb_build_object('submissionId',p_submission_id,'serviceRegionId',region_id),p_correlation_id,'system','website-intake-processor',now());
 return jsonb_build_object('submissionId',p_submission_id,'status','needs_review','decision',v_decision);
exception when others then
 update app_private.website_intake_submissions set lifecycle_status='failed',last_failure_code=sqlstate,updated_at=now() where website_intake_submission_id=p_submission_id;
 raise;
end $$;

create or replace function api.website_intake_list(p_actor_id uuid,p_query jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare region_id uuid:=nullif(p_query->>'serviceRegionId','')::uuid; result jsonb;
begin
 perform app_private.website_intake_require(p_actor_id,'website_intake.read',region_id);
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('submissionId',s.website_intake_submission_id,'sourceSystem',s.source_system,'sourceSubmissionId',s.source_submission_id,'status',s.lifecycle_status,'matchStatus',s.match_status,'duplicateClassification',s.duplicate_classification,'serviceRegionId',s.service_region_id,'receivedAt',s.server_received_at,'version',s.version,'displayName',s.normalized_data->>'displayName') order by s.server_received_at desc),'[]'::jsonb),'page',1,'pageSize',100,'total',count(*)) into result
 from app_private.website_intake_submissions s where (region_id is null or s.service_region_id=region_id)
 and (nullif(p_query->>'status','') is null or s.lifecycle_status=p_query->>'status')
 and (nullif(p_query->>'source','') is null or s.source_system=p_query->>'source')
 and (nullif(p_query->>'duplicateClassification','') is null or s.duplicate_classification=p_query->>'duplicateClassification')
 and (nullif(p_query->>'matchStatus','') is null or s.match_status=p_query->>'matchStatus')
 and (nullif(p_query->>'receivedFrom','') is null or s.server_received_at >= (p_query->>'receivedFrom')::timestamptz)
 and (nullif(p_query->>'receivedTo','') is null or s.server_received_at < ((p_query->>'receivedTo')::date + 1)::timestamptz); return result;
end $$;

create or replace function api.website_intake_detail(p_actor_id uuid,p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s app_private.website_intake_submissions%rowtype;
begin select * into s from app_private.website_intake_submissions where website_intake_submission_id=p_submission_id; if s.website_intake_submission_id is null then raise exception 'not found' using errcode='P0002'; end if; perform app_private.website_intake_require(p_actor_id,'website_intake.read',s.service_region_id);
 return jsonb_build_object('submissionId',s.website_intake_submission_id,'sourceSystem',s.source_system,'sourceSubmissionId',s.source_submission_id,'submittedAt',s.source_submitted_at,'receivedAt',s.server_received_at,'status',s.lifecycle_status,'sourcePayload',s.source_payload,'normalizedData',s.normalized_data,'decision',s.decision,'approvedDecision',s.approved_decision,'validationErrors',s.validation_errors,'matchStatus',s.match_status,'duplicateClassification',s.duplicate_classification,'reviewStatus',s.review_status,'rejectionReason',s.rejection_reason,'serviceRegionId',s.service_region_id,'activationResult',jsonb_strip_nulls(jsonb_build_object('clientId',s.activation_client_id,'serviceAddressId',s.activation_service_address_id,'clientServiceId',s.activation_client_service_id,'serviceConfigurationId',s.activation_service_configuration_id)),'version',s.version,'history',(select coalesce(jsonb_agg(jsonb_build_object('action',r.action,'reason',r.reason,'createdAt',r.created_at) order by r.created_at),'[]') from app_private.website_intake_reviews r where r.website_intake_submission_id=s.website_intake_submission_id));
end $$;

create or replace function api.website_intake_review(p_actor_id uuid,p_submission_id uuid,p_action text,p_expected_version integer,p_decision jsonb,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s app_private.website_intake_submissions%rowtype; target text; permission text;
begin select * into s from app_private.website_intake_submissions where website_intake_submission_id=p_submission_id for update; if s.website_intake_submission_id is null then raise exception 'not found' using errcode='P0002'; end if; if s.version<>p_expected_version then raise exception 'stale_review' using errcode='40001'; end if;
 if p_action='approve' then target:='approved';permission:='website_intake.approve'; if p_decision is null then raise exception 'activation_decision_required' using errcode='22023'; end if;
 elsif p_action='reject' then target:='rejected';permission:='website_intake.reject';if coalesce(length(btrim(p_reason)),0)<3 then raise exception 'reason_required' using errcode='22023'; end if;
 else target:='needs_review';permission:='website_intake.review';if p_decision is null then raise exception 'review_decision_required' using errcode='22023'; end if; end if;
 perform app_private.website_intake_require(p_actor_id,permission,s.service_region_id);
 update app_private.website_intake_submissions set lifecycle_status=target,review_status=case when target='approved' then 'approved' when target='rejected' then 'rejected' else 'required' end,approved_decision=case when target='approved' then p_decision else approved_decision end,decision=case when target='needs_review' then decision||jsonb_build_object('reviewSelection',p_decision) else decision end,rejection_reason=case when target='rejected' then p_reason else rejection_reason end,version=version+1,updated_at=now() where website_intake_submission_id=p_submission_id;
 insert into app_private.website_intake_reviews(website_intake_submission_id,actor_id,action,reason,decision) values(p_submission_id,p_actor_id,case when p_action='approve' then 'approved' when p_action='reject' then 'rejected' else 'match_decision' end,p_reason,p_decision);
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('website_intake.'||p_action,p_actor_id,'website-intake','website-intake',p_submission_id,p_correlation_id,jsonb_build_object('status',target,'reason',p_reason));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('website-intake',case when target='approved' then 'WebsiteIntake.Approved' else 'WebsiteIntake.Rejected' end,1,'website-intake',p_submission_id,jsonb_build_object('submissionId',p_submission_id,'serviceRegionId',s.service_region_id),p_correlation_id,'user',p_actor_id::text,now());
 return jsonb_build_object('submissionId',p_submission_id,'status',target,'version',p_expected_version+1);
end $$;

create or replace function api.website_intake_activate(p_actor_id uuid,p_submission_id uuid,p_expected_version integer,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s app_private.website_intake_submissions%rowtype;
 d jsonb;
 client_id uuid;
 address_id uuid;
 service_id uuid;
 config_id uuid;
 config_result jsonb;
begin
 select * into s from app_private.website_intake_submissions where website_intake_submission_id=p_submission_id for update;
 if s.website_intake_submission_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.website_intake_require(p_actor_id,'website_intake.activate',s.service_region_id);
 if s.lifecycle_status='activated' then
  return jsonb_build_object('submissionId',p_submission_id,'status','activated','duplicate',true,'clientId',s.activation_client_id,'serviceAddressId',s.activation_service_address_id,'clientServiceId',s.activation_client_service_id,'serviceConfigurationId',s.activation_service_configuration_id);
 end if;
 if s.version<>p_expected_version then raise exception 'stale_review' using errcode='40001'; end if;
 if s.lifecycle_status<>'approved' then raise exception 'intake_not_approved' using errcode='55000'; end if;
 d:=s.approved_decision;
 update app_private.website_intake_submissions set lifecycle_status='activating',updated_at=now() where website_intake_submission_id=p_submission_id;
 client_id:=nullif(d->>'existingClientId','')::uuid;
 if client_id is null then
  client_id:=gen_random_uuid();
  perform api.create_client(p_actor_id,'website-intake:'||p_submission_id::text||':client',s.request_fingerprint,p_correlation_id,
   jsonb_build_object('clientId',client_id,'clientType',coalesce(s.normalized_data->>'clientType','individual'),'displayName',s.normalized_data->>'displayName','organisationName',s.normalized_data->>'organisationName','lifecycleStatus','active'));
  perform api.master_data_create(p_actor_id,'client-contacts',gen_random_uuid(),
   jsonb_strip_nulls(jsonb_build_object('client_id',client_id,'contact_name',s.normalized_data->>'contactName','mobile_e164',s.normalized_data->>'mobileE164','email',s.normalized_data->>'email','preferred_language',coalesce(s.normalized_data->>'preferredLanguage','english'),'is_primary',true,'is_active',true)),
   'website-intake:'||p_submission_id::text||':contact',s.request_fingerprint,p_correlation_id);
 end if;
 address_id:=nullif(d->>'existingServiceAddressId','')::uuid;
 if address_id is null then
  address_id:=gen_random_uuid();
  perform api.create_service_address(p_actor_id,p_correlation_id,
   jsonb_strip_nulls(jsonb_build_object('serviceAddressId',address_id,'addressLine1',s.source_payload->'address'->>'addressLine1','addressLine2',s.source_payload->'address'->>'addressLine2','suburb',s.source_payload->'address'->>'suburb','city',s.source_payload->'address'->>'city','postalCode',s.source_payload->'address'->>'postalCode','latitude',s.source_payload->'address'->>'latitude','longitude',s.source_payload->'address'->>'longitude')));
 end if;
 service_id:=gen_random_uuid();
 perform api.create_client_service(p_actor_id,p_correlation_id,
  jsonb_build_object('clientServiceId',service_id,'clientId',client_id,'serviceAddressId',address_id,'lifecycleStatus','active','serviceStartDate',d->>'effectiveStartDate','cadenceCode','weekly'));
 config_result:=api.configure_service(p_actor_id,p_correlation_id,
  jsonb_strip_nulls(jsonb_build_object('clientServiceId',service_id,'serviceRegionId',d->>'serviceRegionId','territoryId',d->>'territoryId','depotId',d->>'depotId','defaultTeamId',d->>'defaultTeamId','configuredDrumCount',d->>'approvedDrumCount','operationalDrumUnitCount',d->>'approvedDrumCount','configuredCollectionDay',d->>'collectionDay','effectiveFrom',d->>'effectiveStartDate')));
 config_id:=(config_result->>'serviceConfigurationId')::uuid;
 insert into app_private.external_references(source_system,entity_type,internal_entity_id,external_identifier)
 values(s.source_system,'website-intake',p_submission_id,s.source_submission_id),
  (s.source_system,'client',client_id,coalesce(s.source_payload->'references'->>'customerReference',s.source_submission_id)),
  (s.source_system,'client-service',service_id,coalesce(s.source_payload->'references'->>'serviceReference',s.source_submission_id||':service')) on conflict do nothing;
 update app_private.website_intake_submissions set lifecycle_status='activated',activation_client_id=client_id,activation_service_address_id=address_id,activation_client_service_id=service_id,activation_service_configuration_id=config_id,version=version+1,updated_at=now() where website_intake_submission_id=p_submission_id;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('website_intake.activated',p_actor_id,'website-intake','website-intake',p_submission_id,p_correlation_id,jsonb_build_object('clientId',client_id,'serviceAddressId',address_id,'clientServiceId',service_id,'serviceConfigurationId',config_id));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('website-intake','WebsiteIntake.Activated',1,'website-intake',p_submission_id,jsonb_build_object('submissionId',p_submission_id,'clientId',client_id,'serviceAddressId',address_id,'clientServiceId',service_id),p_correlation_id,'user',p_actor_id::text,now());
 return jsonb_build_object('submissionId',p_submission_id,'status','activated','duplicate',false,'clientId',client_id,'serviceAddressId',address_id,'clientServiceId',service_id,'serviceConfigurationId',config_id);
end
$$;

create or replace function api.website_intake_source_status(p_integration_key text,p_source_submission_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare intake app_private.website_intake_submissions%rowtype;
begin select sub.* into intake from app_private.website_intake_submissions sub join app_private.integration_registrations r on r.integration_id=sub.integration_id where r.integration_key=p_integration_key and r.lifecycle_status='enabled' and sub.source_submission_id=p_source_submission_id; if intake.website_intake_submission_id is null then raise exception 'not found' using errcode='P0002'; end if; return jsonb_build_object('sourceSubmissionId',intake.source_submission_id,'status',app_private.website_intake_public_status(intake.lifecycle_status)); end $$;

revoke all on function app_private.website_intake_require(uuid,text,uuid),app_private.website_intake_public_status(text) from public,anon,authenticated;
revoke all on function api.website_intake_receive(text,text,text,text,uuid,jsonb),api.website_intake_process(uuid,uuid),api.website_intake_list(uuid,jsonb),api.website_intake_detail(uuid,uuid),api.website_intake_review(uuid,uuid,text,integer,jsonb,text,uuid),api.website_intake_activate(uuid,uuid,integer,uuid),api.website_intake_source_status(text,text) from public,anon,authenticated;
grant execute on function api.website_intake_receive(text,text,text,text,uuid,jsonb),api.website_intake_process(uuid,uuid),api.website_intake_list(uuid,jsonb),api.website_intake_detail(uuid,uuid),api.website_intake_review(uuid,uuid,text,integer,jsonb,text,uuid),api.website_intake_activate(uuid,uuid,integer,uuid),api.website_intake_source_status(text,text) to service_role;
