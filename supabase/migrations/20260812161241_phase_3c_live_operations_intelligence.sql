-- Phase 3C: reviewable live-operations intelligence. Inference never mutates route truth.

alter table app_private.outbox_events drop constraint outbox_events_producer_module_check;
alter table app_private.outbox_events add constraint outbox_events_producer_module_check check (
 producer_module in ('identity-access','clients','service-addresses','service-configuration','geography','workforce','vehicles','daily-roster','routes','route-operations','vehicle-tracking','operational-intelligence','operational-issues','needs-attention','communications','integrations','configuration','reporting','audit','system-health')
);

insert into app_private.permissions(permission_key,description) values
 ('live_operations.read','Read the regional live-operations workspace'),
 ('operational_intelligence.read','Read derived operational facts'),
 ('operational_intelligence.review','Acknowledge, resolve, or dismiss derived facts'),
 ('operational_intelligence.process','Run bounded operational-intelligence processing'),
 ('needs_attention.read','Read regional Needs Attention items'),
 ('needs_attention.manage','Review and assign Needs Attention items')
on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
 select r.role_id,p.permission_key from app_private.roles r cross join app_private.permissions p
 where r.role_key in ('director_admin','operations_manager') and p.permission_key in
 ('live_operations.read','operational_intelligence.read','operational_intelligence.review','operational_intelligence.process','needs_attention.read','needs_attention.manage') on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
 select r.role_id,p.permission_key from app_private.roles r cross join app_private.permissions p
 where r.role_key='office_admin' and p.permission_key in
 ('live_operations.read','operational_intelligence.read','operational_intelligence.review','needs_attention.read','needs_attention.manage') on conflict do nothing;

insert into app_private.configuration_definitions(configuration_key,description,value_type,default_value) values
 ('operational-intelligence.stop-arrival-radius-metres','Candidate arrival radius','number','75'),
 ('operational-intelligence.stop-departure-radius-metres','Candidate departure radius','number','110'),
 ('operational-intelligence.minimum-dwell-seconds','Minimum stop dwell','number','120'),
 ('operational-intelligence.route-corridor-tolerance-metres','Published route corridor tolerance','number','250'),
 ('operational-intelligence.deviation-minimum-observations','Consecutive observations required for deviation','number','3'),
 ('operational-intelligence.stationary-seconds','Unexpected stationary threshold','number','900'),
 ('operational-intelligence.stationary-radius-metres','Maximum movement considered stationary','number','25'),
 ('operational-intelligence.late-start-tolerance-seconds','Late route start tolerance','number','600'),
 ('operational-intelligence.inter-stop-duration-multiplier','Excessive inter-stop multiplier','number','2'),
 ('operational-intelligence.outside-hours-grace-seconds','Working-window grace','number','900'),
 ('operational-intelligence.unexpected-area-tolerance-metres','Unexpected-area tolerance','number','500'),
 ('operational-intelligence.minimum-quality-accuracy-metres','Maximum accuracy for inference','number','100'),
 ('operational-intelligence.fact-deduplication-seconds','Continuous fact suppression window','number','1800'),
 ('operational-intelligence.completion-tolerance-seconds','Early or late completion tolerance','number','900')
on conflict do nothing;

create table app_private.derived_operational_facts (
 operational_fact_id uuid primary key default gen_random_uuid(),
 fact_type text not null check(fact_type in ('stop_arrival','stop_departure','route_deviation','unusual_stationary','late_start','excessive_inter_stop','falling_behind','completion_timing','outside_hours_movement','unexpected_area','depot_presence')),
 vehicle_id uuid not null references app_private.vehicles,
 route_operation_id uuid references app_private.route_operations,
 route_operation_stop_id uuid references app_private.route_operation_stops,
 service_region_id uuid not null references app_private.service_regions,
 detected_at timestamptz not null, evidence_from timestamptz not null, evidence_to timestamptz not null,
 confidence text not null check(confidence in ('low','medium','high')),
 severity text not null check(severity in ('info','warning','critical')),
 lifecycle_status text not null default 'open' check(lifecycle_status in ('open','acknowledged','resolved','dismissed','superseded')),
 deduplication_key text not null, rule_version text not null, source_route_version_id uuid references app_private.route_versions,
 source_manifest_revision integer, summary text not null check(char_length(summary)<=500),
 evidence jsonb not null check(jsonb_typeof(evidence)='object'),
 first_observation_id uuid references app_private.vehicle_location_observations,
 last_observation_id uuid references app_private.vehicle_location_observations,
 acknowledged_at timestamptz, acknowledged_by uuid references auth.users,
 resolved_at timestamptz, resolved_by uuid references auth.users, resolution_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index derived_facts_one_active_dedup on app_private.derived_operational_facts(deduplication_key) where lifecycle_status in ('open','acknowledged');
create index derived_facts_region_open_idx on app_private.derived_operational_facts(service_region_id,lifecycle_status,detected_at desc);
create index derived_facts_vehicle_idx on app_private.derived_operational_facts(vehicle_id,detected_at desc);
create index derived_facts_operation_idx on app_private.derived_operational_facts(route_operation_id,fact_type,lifecycle_status);

create table app_private.needs_attention_items (
 needs_attention_item_id uuid primary key default gen_random_uuid(), source_type text not null default 'operational_fact' check(source_type='operational_fact'),
 source_id uuid not null references app_private.derived_operational_facts,
 service_region_id uuid not null references app_private.service_regions,
 severity text not null check(severity in ('info','warning','critical')),
 lifecycle_status text not null default 'open' check(lifecycle_status in ('open','acknowledged','resolved','dismissed')),
 assigned_user_id uuid references auth.users on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 resolved_at timestamptz, resolved_by uuid references auth.users, resolution_reason text,
 unique(source_type,source_id)
);
create index needs_attention_region_open_idx on app_private.needs_attention_items(service_region_id,lifecycle_status,severity,created_at desc);

create table app_private.live_route_progress (
 route_operation_id uuid primary key references app_private.route_operations on delete cascade,
 service_region_id uuid not null references app_private.service_regions, vehicle_id uuid not null references app_private.vehicles,
 current_stop_id uuid references app_private.route_operation_stops, next_stop_id uuid references app_private.route_operation_stops,
 current_interpretation text not null check(current_interpretation in ('approaching_stop','at_stop','between_stops','route_unknown','tracking_insufficient')),
 authoritative_completed_stops integer not null default 0, inferred_visited_stops integer not null default 0, remaining_stops integer not null default 0,
 schedule_risk text not null check(schedule_risk in ('on_track','at_risk','behind','unknown')),
 tracking_health text not null, evidence_at timestamptz, rule_version text not null, updated_at timestamptz not null default now()
);
create index live_route_progress_region_idx on app_private.live_route_progress(service_region_id,schedule_risk);

create table app_private.intelligence_processing_checkpoints (
 vehicle_id uuid primary key references app_private.vehicles, route_operation_id uuid references app_private.route_operations,
 last_observation_id uuid references app_private.vehicle_location_observations, last_recorded_at timestamptz,
 rule_version text not null, processed_at timestamptz not null default now(), last_failure_code text
);

create or replace function app_private.require_intelligence_access(p_actor_id uuid,p_permission text,p_region_id uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not (app_private.user_has_global_permission(p_actor_id,p_permission) or app_private.user_has_region_permission(p_actor_id,p_permission,p_region_id)) then raise exception 'permission denied' using errcode='42501'; end if;
end $$;

create or replace function app_private.apply_operational_signal(p_signal jsonb,p_correlation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing app_private.derived_operational_facts%rowtype; fact app_private.derived_operational_facts%rowtype; desired text:=coalesce(p_signal->>'status','open'); begin
 if desired='resolved' then
  update app_private.derived_operational_facts set lifecycle_status='resolved',resolved_at=coalesce((p_signal->>'detectedAt')::timestamptz,now()),resolution_reason=coalesce(p_signal->>'resolutionReason','Automatically resolved by recovery evidence'),updated_at=now()
  where deduplication_key=p_signal->>'deduplicationKey' and lifecycle_status in ('open','acknowledged') returning * into fact;
  if fact.operational_fact_id is not null then
   update app_private.needs_attention_items set lifecycle_status='resolved',resolved_at=fact.resolved_at,resolution_reason=fact.resolution_reason,updated_at=now() where source_id=fact.operational_fact_id and lifecycle_status in ('open','acknowledged');
   insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('operational-intelligence','OperationalIntelligence.FactResolved',1,'operational-fact',fact.operational_fact_id,jsonb_build_object('factId',fact.operational_fact_id,'factType',fact.fact_type,'serviceRegionId',fact.service_region_id),p_correlation_id,'system','operational-intelligence',now());
  end if; return fact.operational_fact_id;
 end if;
 select * into existing from app_private.derived_operational_facts where deduplication_key=p_signal->>'deduplicationKey' and lifecycle_status in ('open','acknowledged') for update;
 if existing.operational_fact_id is not null then
  update app_private.derived_operational_facts set evidence_to=(p_signal->>'evidenceTo')::timestamptz,detected_at=greatest(detected_at,(p_signal->>'detectedAt')::timestamptz),confidence=p_signal->>'confidence',severity=p_signal->>'severity',summary=p_signal->>'summary',evidence=p_signal->'evidence',last_observation_id=nullif(p_signal->>'lastObservationId','')::uuid,updated_at=now() where operational_fact_id=existing.operational_fact_id returning * into fact;
  update app_private.needs_attention_items set severity=fact.severity,updated_at=now() where source_id=fact.operational_fact_id; return fact.operational_fact_id;
 end if;
 insert into app_private.derived_operational_facts(fact_type,vehicle_id,route_operation_id,route_operation_stop_id,service_region_id,detected_at,evidence_from,evidence_to,confidence,severity,deduplication_key,rule_version,source_route_version_id,source_manifest_revision,summary,evidence,first_observation_id,last_observation_id)
 values(p_signal->>'factType',(p_signal->>'vehicleId')::uuid,nullif(p_signal->>'routeOperationId','')::uuid,nullif(p_signal->>'routeOperationStopId','')::uuid,(p_signal->>'serviceRegionId')::uuid,(p_signal->>'detectedAt')::timestamptz,(p_signal->>'evidenceFrom')::timestamptz,(p_signal->>'evidenceTo')::timestamptz,p_signal->>'confidence',p_signal->>'severity',p_signal->>'deduplicationKey',p_signal->>'ruleVersion',nullif(p_signal->>'sourceRouteVersionId','')::uuid,nullif(p_signal->>'sourceManifestRevision','')::integer,p_signal->>'summary',p_signal->'evidence',nullif(p_signal->>'firstObservationId','')::uuid,nullif(p_signal->>'lastObservationId','')::uuid) returning * into fact;
 insert into app_private.needs_attention_items(source_id,service_region_id,severity) values(fact.operational_fact_id,fact.service_region_id,fact.severity);
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('operational-intelligence','OperationalIntelligence.FactCreated',1,'operational-fact',fact.operational_fact_id,jsonb_build_object('factId',fact.operational_fact_id,'factType',fact.fact_type,'serviceRegionId',fact.service_region_id,'confidence',fact.confidence,'severity',fact.severity),p_correlation_id,'system','operational-intelligence',now());
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('needs-attention','NeedsAttention.ItemCreated',1,'needs-attention-item',(select needs_attention_item_id from app_private.needs_attention_items where source_id=fact.operational_fact_id),jsonb_build_object('factId',fact.operational_fact_id,'serviceRegionId',fact.service_region_id),p_correlation_id,'system','operational-intelligence',now());
 return fact.operational_fact_id; end $$;

create or replace function api.operational_intelligence_apply(p_actor_id uuid,p_region_id uuid,p_signals jsonb,p_progress jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare signal jsonb; ids jsonb:='[]'::jsonb; fid uuid; begin
 perform app_private.require_intelligence_access(p_actor_id,'operational_intelligence.process',p_region_id);
 if jsonb_typeof(p_signals)<>'array' or jsonb_array_length(p_signals)>100 then raise exception 'invalid_signal_batch' using errcode='22023'; end if;
 for signal in select value from jsonb_array_elements(p_signals) loop
  if signal->>'serviceRegionId'<>p_region_id::text then raise exception 'signal_region_mismatch' using errcode='22023'; end if;
  if not exists(select 1 from app_private.vehicles v where v.vehicle_id=(signal->>'vehicleId')::uuid and v.service_region_id=p_region_id) then raise exception 'signal_vehicle_mismatch' using errcode='22023'; end if;
  if nullif(signal->>'routeOperationId','') is not null and not exists(select 1 from app_private.route_operations o where o.route_operation_id=(signal->>'routeOperationId')::uuid and o.service_region_id=p_region_id and o.current_vehicle_id=(signal->>'vehicleId')::uuid) then raise exception 'signal_operation_mismatch' using errcode='22023'; end if;
  if nullif(signal->>'routeOperationStopId','') is not null and not exists(select 1 from app_private.route_operation_stops s where s.route_operation_stop_id=(signal->>'routeOperationStopId')::uuid and s.route_operation_id=(signal->>'routeOperationId')::uuid) then raise exception 'signal_stop_mismatch' using errcode='22023'; end if;
  fid:=app_private.apply_operational_signal(signal,p_correlation_id); ids:=ids||jsonb_build_array(fid);
 end loop;
 if p_progress is not null and p_progress<>'null'::jsonb then
  insert into app_private.live_route_progress(route_operation_id,service_region_id,vehicle_id,current_stop_id,next_stop_id,current_interpretation,authoritative_completed_stops,inferred_visited_stops,remaining_stops,schedule_risk,tracking_health,evidence_at,rule_version)
  values((p_progress->>'routeOperationId')::uuid,p_region_id,(p_progress->>'vehicleId')::uuid,nullif(p_progress->>'currentStopId','')::uuid,nullif(p_progress->>'nextStopId','')::uuid,p_progress->>'currentInterpretation',(p_progress->>'authoritativeCompletedStops')::integer,(p_progress->>'inferredVisitedStops')::integer,(p_progress->>'remainingStops')::integer,p_progress->>'scheduleRisk',p_progress->>'trackingHealth',nullif(p_progress->>'evidenceAt','')::timestamptz,p_progress->>'ruleVersion')
  on conflict(route_operation_id) do update set current_stop_id=excluded.current_stop_id,next_stop_id=excluded.next_stop_id,current_interpretation=excluded.current_interpretation,authoritative_completed_stops=excluded.authoritative_completed_stops,inferred_visited_stops=excluded.inferred_visited_stops,remaining_stops=excluded.remaining_stops,schedule_risk=excluded.schedule_risk,tracking_health=excluded.tracking_health,evidence_at=excluded.evidence_at,rule_version=excluded.rule_version,updated_at=now();
  insert into app_private.intelligence_processing_checkpoints(vehicle_id,route_operation_id,last_recorded_at,rule_version) values((p_progress->>'vehicleId')::uuid,(p_progress->>'routeOperationId')::uuid,nullif(p_progress->>'evidenceAt','')::timestamptz,p_progress->>'ruleVersion') on conflict(vehicle_id) do update set route_operation_id=excluded.route_operation_id,last_recorded_at=excluded.last_recorded_at,rule_version=excluded.rule_version,processed_at=now(),last_failure_code=null;
 end if; return jsonb_build_object('factIds',ids,'processedSignals',jsonb_array_length(p_signals)); end $$;

create or replace function api.operational_facts_list(p_actor_id uuid,p_region_id uuid,p_status text default null)
returns jsonb language plpgsql security definer set search_path='' as $$ begin perform app_private.require_intelligence_access(p_actor_id,'operational_intelligence.read',p_region_id);
 return coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('vehicleName',v.display_name,'teamName',t.name,'routeStatus',o.lifecycle_status,'stopSequence',s.sequence_number) order by f.detected_at desc) from app_private.derived_operational_facts f join app_private.vehicles v on v.vehicle_id=f.vehicle_id left join app_private.route_operations o on o.route_operation_id=f.route_operation_id left join app_private.teams t on t.team_id=o.current_team_id left join app_private.route_operation_stops s on s.route_operation_stop_id=f.route_operation_stop_id where f.service_region_id=p_region_id and (p_status is null or f.lifecycle_status=p_status)),'[]'); end $$;

create or replace function api.needs_attention_list(p_actor_id uuid,p_region_id uuid,p_status text default null)
returns jsonb language plpgsql security definer set search_path='' as $$ begin perform app_private.require_intelligence_access(p_actor_id,'needs_attention.read',p_region_id);
 return coalesce((select jsonb_agg(to_jsonb(n)||jsonb_build_object('factType',f.fact_type,'summary',f.summary,'confidence',f.confidence,'vehicleId',f.vehicle_id,'routeOperationId',f.route_operation_id) order by n.created_at desc) from app_private.needs_attention_items n join app_private.derived_operational_facts f on f.operational_fact_id=n.source_id where n.service_region_id=p_region_id and (p_status is null or n.lifecycle_status=p_status)),'[]'); end $$;

create or replace function api.operational_fact_review(p_actor_id uuid,p_fact_id uuid,p_action text,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare f app_private.derived_operational_facts%rowtype; target text; begin
 select * into f from app_private.derived_operational_facts where operational_fact_id=p_fact_id for update; if f.operational_fact_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.require_intelligence_access(p_actor_id,'operational_intelligence.review',f.service_region_id);
 if p_action not in ('acknowledge','resolve','dismiss') or (p_action in ('resolve','dismiss') and nullif(trim(p_reason),'') is null) then raise exception 'invalid_review_action' using errcode='22023'; end if;
 target:=case p_action when 'acknowledge' then 'acknowledged' when 'resolve' then 'resolved' else 'dismissed' end;
 update app_private.derived_operational_facts set lifecycle_status=target,acknowledged_at=case when target='acknowledged' then now() else acknowledged_at end,acknowledged_by=case when target='acknowledged' then p_actor_id else acknowledged_by end,resolved_at=case when target in ('resolved','dismissed') then now() else resolved_at end,resolved_by=case when target in ('resolved','dismissed') then p_actor_id else resolved_by end,resolution_reason=case when target in ('resolved','dismissed') then p_reason else resolution_reason end,updated_at=now() where operational_fact_id=p_fact_id returning * into f;
 update app_private.needs_attention_items set lifecycle_status=target,updated_at=now(),resolved_at=case when target in ('resolved','dismissed') then now() else resolved_at end,resolved_by=case when target in ('resolved','dismissed') then p_actor_id else resolved_by end,resolution_reason=case when target in ('resolved','dismissed') then p_reason else resolution_reason end where source_id=p_fact_id;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('operational_intelligence.fact_'||target,p_actor_id,'operational-intelligence','operational-fact',p_fact_id,p_correlation_id,jsonb_build_object('status',target,'reason',case when p_reason is null then null else left(p_reason,200) end));
 if target in ('resolved','dismissed') then insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('operational-intelligence','OperationalIntelligence.FactResolved',1,'operational-fact',p_fact_id,jsonb_build_object('factId',p_fact_id,'status',target,'serviceRegionId',f.service_region_id),p_correlation_id,'user',p_actor_id::text,now()); end if; return to_jsonb(f); end $$;

create or replace function api.live_operations_overview(p_actor_id uuid,p_region_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ begin perform app_private.require_intelligence_access(p_actor_id,'live_operations.read',p_region_id);
 return jsonb_build_object('routes',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('vehicleName',v.display_name,'registrationReference',v.registration_reference,'teamName',t.name,'routeStatus',o.lifecycle_status,'position',(select jsonb_build_object('latitude',c.latitude,'longitude',c.longitude,'recordedAt',c.recorded_at,'accuracyMetres',c.accuracy_metres) from app_private.current_vehicle_positions c where c.vehicle_id=p.vehicle_id),'openFactCount',(select count(*) from app_private.derived_operational_facts f where f.route_operation_id=p.route_operation_id and f.lifecycle_status in ('open','acknowledged'))) order by v.display_name) from app_private.live_route_progress p join app_private.vehicles v on v.vehicle_id=p.vehicle_id join app_private.route_operations o on o.route_operation_id=p.route_operation_id left join app_private.teams t on t.team_id=o.current_team_id where p.service_region_id=p_region_id),'[]'),'openNeedsAttention',(select count(*) from app_private.needs_attention_items where service_region_id=p_region_id and lifecycle_status in ('open','acknowledged'))); end $$;

create or replace function api.operational_fact_detail(p_actor_id uuid,p_fact_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare f app_private.derived_operational_facts%rowtype; begin select * into f from app_private.derived_operational_facts where operational_fact_id=p_fact_id; if f.operational_fact_id is null then raise exception 'not found' using errcode='P0002'; end if; perform app_private.require_intelligence_access(p_actor_id,'operational_intelligence.read',f.service_region_id); return to_jsonb(f); end $$;

create or replace function api.live_operations_vehicle_detail(p_actor_id uuid,p_vehicle_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare region uuid; begin select service_region_id into region from app_private.vehicles where vehicle_id=p_vehicle_id; if region is null then raise exception 'not found' using errcode='P0002'; end if; perform app_private.require_intelligence_access(p_actor_id,'live_operations.read',region); return jsonb_build_object('progress',(select to_jsonb(p) from app_private.live_route_progress p where p.vehicle_id=p_vehicle_id order by updated_at desc limit 1),'position',(select jsonb_build_object('observationId',c.observation_id,'recordedAt',c.recorded_at,'latitude',c.latitude,'longitude',c.longitude,'accuracyMetres',c.accuracy_metres) from app_private.current_vehicle_positions c where c.vehicle_id=p_vehicle_id),'openFacts',coalesce((select jsonb_agg(to_jsonb(f) order by detected_at desc) from app_private.derived_operational_facts f where f.vehicle_id=p_vehicle_id and f.lifecycle_status in ('open','acknowledged')),'[]')); end $$;

create or replace function api.live_route_progress_detail(p_actor_id uuid,p_route_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare p app_private.live_route_progress%rowtype; begin select * into p from app_private.live_route_progress where route_operation_id=p_route_operation_id; if p.route_operation_id is null then raise exception 'not found' using errcode='P0002'; end if; perform app_private.require_intelligence_access(p_actor_id,'live_operations.read',p.service_region_id); return to_jsonb(p); end $$;

create or replace function api.needs_attention_detail(p_actor_id uuid,p_item_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare n app_private.needs_attention_items%rowtype; begin select * into n from app_private.needs_attention_items where needs_attention_item_id=p_item_id; if n.needs_attention_item_id is null then raise exception 'not found' using errcode='P0002'; end if; perform app_private.require_intelligence_access(p_actor_id,'needs_attention.read',n.service_region_id); return to_jsonb(n)||jsonb_build_object('fact',(select to_jsonb(f) from app_private.derived_operational_facts f where f.operational_fact_id=n.source_id)); end $$;

alter table app_private.derived_operational_facts enable row level security; alter table app_private.needs_attention_items enable row level security; alter table app_private.live_route_progress enable row level security; alter table app_private.intelligence_processing_checkpoints enable row level security;
revoke all on app_private.derived_operational_facts,app_private.needs_attention_items,app_private.live_route_progress,app_private.intelligence_processing_checkpoints from public,anon,authenticated;
grant select,insert,update,delete on app_private.derived_operational_facts,app_private.needs_attention_items,app_private.live_route_progress,app_private.intelligence_processing_checkpoints to service_role;
revoke all on function app_private.require_intelligence_access(uuid,text,uuid),app_private.apply_operational_signal(jsonb,uuid) from public; grant execute on function app_private.require_intelligence_access(uuid,text,uuid),app_private.apply_operational_signal(jsonb,uuid) to service_role;
grant execute on function api.operational_intelligence_apply(uuid,uuid,jsonb,jsonb,uuid),api.operational_facts_list(uuid,uuid,text),api.needs_attention_list(uuid,uuid,text),api.operational_fact_review(uuid,uuid,text,text,uuid),api.live_operations_overview(uuid,uuid),api.operational_fact_detail(uuid,uuid),api.live_operations_vehicle_detail(uuid,uuid),api.live_route_progress_detail(uuid,uuid),api.needs_attention_detail(uuid,uuid) to service_role;
