-- Phase 1D: authoritative day-specific operational roster foundation.

insert into app_private.permissions(permission_key,description) values
 ('roster.read','Read daily operational rosters within assigned regions'),
 ('roster.write','Prepare and change daily operational rosters'),
 ('roster.generate','Generate a roster from permanent configuration'),
 ('roster.lock','Mark ready rosters as stable operational input'),
 ('roster.unlock','Explicitly unlock a roster with a reason'),
 ('availability.manage','Manage operational staff and vehicle availability windows')
on conflict do nothing;

insert into app_private.role_permissions(role_id,permission_key)
select role_id,permission_key from app_private.roles cross join app_private.permissions
where role_key in ('director_admin','operations_manager') and permission_key in ('roster.read','roster.write','roster.generate','roster.lock','roster.unlock','availability.manage') on conflict do nothing;
insert into app_private.role_permissions(role_id,permission_key)
select role_id,permission_key from app_private.roles cross join app_private.permissions
where role_key='office_admin' and permission_key in ('roster.read','roster.write','roster.generate','roster.lock','availability.manage') on conflict do nothing;

create table app_private.operational_days (
 operational_day_id uuid primary key default gen_random_uuid(), service_date date not null,
 service_region_id uuid not null references app_private.service_regions, timezone text not null,
 lifecycle_status text not null default 'draft' check(lifecycle_status in ('draft','ready','locked','active','closed','archived')),
 generated_at timestamptz, locked_at timestamptz, locked_by uuid references auth.users on delete set null,
 closed_at timestamptz, archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(service_region_id,service_date)
);
create index operational_days_region_date_idx on app_private.operational_days(service_region_id,service_date desc);

create table app_private.staff_availability_windows (
 staff_availability_window_id uuid primary key default gen_random_uuid(), staff_id uuid not null references app_private.staff,
 service_region_id uuid not null references app_private.service_regions, starts_at timestamptz not null, ends_at timestamptz not null,
 full_day boolean not null default false, availability_status text not null check(availability_status in ('unavailable','limited')),
 reason text not null check(char_length(trim(reason))>0), note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create index staff_availability_window_lookup_idx on app_private.staff_availability_windows(staff_id,starts_at,ends_at);
create index staff_availability_region_idx on app_private.staff_availability_windows(service_region_id,starts_at);

create table app_private.vehicle_availability_windows (
 vehicle_availability_window_id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references app_private.vehicles,
 service_region_id uuid not null references app_private.service_regions, starts_at timestamptz not null, ends_at timestamptz not null,
 availability_status text not null check(availability_status in ('maintenance','unavailable')),
 reason text not null check(char_length(trim(reason))>0), note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create index vehicle_availability_window_lookup_idx on app_private.vehicle_availability_windows(vehicle_id,starts_at,ends_at);
create index vehicle_availability_region_idx on app_private.vehicle_availability_windows(service_region_id,starts_at);

create table app_private.daily_roster_entries (
 daily_roster_entry_id uuid primary key default gen_random_uuid(), operational_day_id uuid not null references app_private.operational_days on delete cascade,
 team_id uuid not null references app_private.teams, normal_vehicle_id uuid references app_private.vehicles, assigned_vehicle_id uuid references app_private.vehicles,
 normal_depot_id uuid references app_private.depots, assigned_depot_id uuid references app_private.depots,
 entry_status text not null default 'planned' check(entry_status in ('planned','unavailable','active','completed','cancelled')),
 availability_state text not null default 'available' check(availability_state in ('available','warning','unavailable')),
 vehicle_is_substitution boolean not null default false, depot_is_override boolean not null default false,
 substitution_reason text, version integer not null default 1 check(version>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(operational_day_id,team_id)
);
create index roster_entries_day_idx on app_private.daily_roster_entries(operational_day_id);
create unique index roster_vehicle_one_team_idx on app_private.daily_roster_entries(operational_day_id,assigned_vehicle_id) where assigned_vehicle_id is not null and entry_status<>'cancelled';

create table app_private.daily_roster_staff_assignments (
 daily_roster_staff_assignment_id uuid primary key default gen_random_uuid(), daily_roster_entry_id uuid not null references app_private.daily_roster_entries on delete cascade,
 staff_id uuid not null references app_private.staff, expected_team_id uuid references app_private.teams, assignment_role text not null,
 is_substitution boolean not null default false, substitution_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(daily_roster_entry_id,staff_id)
);
create index roster_staff_entry_idx on app_private.daily_roster_staff_assignments(daily_roster_entry_id);

create table app_private.daily_roster_assignment_history (
 daily_roster_assignment_history_id uuid primary key default gen_random_uuid(), operational_day_id uuid not null references app_private.operational_days,
 daily_roster_entry_id uuid not null references app_private.daily_roster_entries, version integer not null, change_kind text not null,
 changed_by uuid references auth.users on delete set null, reason text, assignment_snapshot jsonb not null,
 changed_at timestamptz not null default now(), unique(daily_roster_entry_id,version)
);
create index roster_history_day_idx on app_private.daily_roster_assignment_history(operational_day_id,changed_at);

create table app_private.daily_roster_unlocks (
 daily_roster_unlock_id uuid primary key default gen_random_uuid(), operational_day_id uuid not null references app_private.operational_days,
 unlocked_by uuid not null references auth.users, reason text not null check(char_length(trim(reason))>0), previous_status text not null,
 created_at timestamptz not null default now()
);

alter table app_private.operational_days enable row level security;
alter table app_private.staff_availability_windows enable row level security;
alter table app_private.vehicle_availability_windows enable row level security;
alter table app_private.daily_roster_entries enable row level security;
alter table app_private.daily_roster_staff_assignments enable row level security;
alter table app_private.daily_roster_assignment_history enable row level security;
alter table app_private.daily_roster_unlocks enable row level security;
revoke all on app_private.operational_days,app_private.staff_availability_windows,app_private.vehicle_availability_windows,app_private.daily_roster_entries,app_private.daily_roster_staff_assignments,app_private.daily_roster_assignment_history,app_private.daily_roster_unlocks from public,anon,authenticated;
grant select,insert,update,delete on app_private.operational_days,app_private.staff_availability_windows,app_private.vehicle_availability_windows,app_private.daily_roster_entries,app_private.daily_roster_staff_assignments,app_private.daily_roster_assignment_history,app_private.daily_roster_unlocks to service_role;

create or replace function app_private.operational_day_bounds(p_day app_private.operational_days)
returns tstzrange language sql stable set search_path='' as $$
 select tstzrange(p_day.service_date::timestamp at time zone p_day.timezone,(p_day.service_date+1)::timestamp at time zone p_day.timezone,'[)')
$$;

create or replace function app_private.roster_snapshot(p_entry_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(e)||jsonb_build_object('staff',coalesce((select jsonb_agg(to_jsonb(s) order by s.staff_id) from app_private.daily_roster_staff_assignments s where s.daily_roster_entry_id=e.daily_roster_entry_id),'[]'::jsonb))
 from app_private.daily_roster_entries e where e.daily_roster_entry_id=p_entry_id
$$;

create or replace function app_private.record_roster_history(p_entry_id uuid,p_actor_id uuid,p_kind text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare entry app_private.daily_roster_entries%rowtype;
begin select * into entry from app_private.daily_roster_entries where daily_roster_entry_id=p_entry_id;
 insert into app_private.daily_roster_assignment_history(operational_day_id,daily_roster_entry_id,version,change_kind,changed_by,reason,assignment_snapshot)
 values(entry.operational_day_id,p_entry_id,entry.version,p_kind,p_actor_id,p_reason,app_private.roster_snapshot(p_entry_id)); end $$;

create or replace function app_private.require_roster_access(p_actor_id uuid,p_permission text,p_region_id uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not app_private.user_has_region_permission(p_actor_id,p_permission,p_region_id) then raise exception 'permission denied' using errcode='42501'; end if;
end $$;

create or replace function api.roster_generate(p_actor_id uuid,p_service_region_id uuid,p_service_date date,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare day app_private.operational_days%rowtype; team app_private.teams%rowtype; entry_id uuid; bounds tstzrange; created_day boolean:=false;
begin
 perform app_private.require_roster_access(p_actor_id,'roster.generate',p_service_region_id);
 insert into app_private.operational_days(service_date,service_region_id,timezone) select p_service_date,p_service_region_id,r.default_timezone from app_private.service_regions r where r.service_region_id=p_service_region_id on conflict do nothing returning * into day;
 if day.operational_day_id is not null then created_day:=true; else select * into day from app_private.operational_days where service_region_id=p_service_region_id and service_date=p_service_date for update; end if;
 if day.lifecycle_status<>'draft' then return api.roster_get(p_actor_id,day.operational_day_id); end if;
 bounds:=app_private.operational_day_bounds(day);
 for team in select * from app_private.teams t where t.service_region_id=p_service_region_id and t.is_active loop
  insert into app_private.daily_roster_entries(operational_day_id,team_id,normal_vehicle_id,assigned_vehicle_id,normal_depot_id,assigned_depot_id,availability_state)
  values(day.operational_day_id,team.team_id,team.normal_vehicle_id,
   case when exists(select 1 from app_private.vehicles v where v.vehicle_id=team.normal_vehicle_id and v.is_active and v.operational_availability in ('available','in_service') and not exists(select 1 from app_private.vehicle_availability_windows w where w.vehicle_id=v.vehicle_id and tstzrange(w.starts_at,w.ends_at,'[)') && bounds)) then team.normal_vehicle_id end,
   team.default_depot_id,team.default_depot_id,
   case when team.normal_vehicle_id is null or not exists(select 1 from app_private.vehicles v where v.vehicle_id=team.normal_vehicle_id and v.is_active and v.operational_availability in ('available','in_service') and not exists(select 1 from app_private.vehicle_availability_windows w where w.vehicle_id=v.vehicle_id and tstzrange(w.starts_at,w.ends_at,'[)') && bounds)) then 'warning' else 'available' end)
  on conflict(operational_day_id,team_id) do nothing returning daily_roster_entry_id into entry_id;
  if entry_id is not null then
   insert into app_private.daily_roster_staff_assignments(daily_roster_entry_id,staff_id,expected_team_id,assignment_role)
   select entry_id,s.staff_id,s.default_team_id,s.operational_role from app_private.staff s where s.default_team_id=team.team_id and s.is_active
    and not exists(select 1 from app_private.staff_availability_windows w where w.staff_id=s.staff_id and w.availability_status='unavailable' and tstzrange(w.starts_at,w.ends_at,'[)') && bounds);
   perform app_private.record_roster_history(entry_id,p_actor_id,'generated',null);
  end if; entry_id:=null;
 end loop;
 update app_private.operational_days set generated_at=coalesce(generated_at,now()),updated_at=now() where operational_day_id=day.operational_day_id returning * into day;
 if created_day then insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('daily-roster','DailyRoster.OperationalDayCreated',1,'operational-day',day.operational_day_id,jsonb_build_object('operationalDayId',day.operational_day_id,'serviceRegionId',p_service_region_id,'serviceDate',p_service_date),p_correlation_id,'user',p_actor_id::text,now()); end if;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('daily_roster.generated',p_actor_id,'daily-roster','operational-day',day.operational_day_id,p_correlation_id,jsonb_build_object('serviceDate',p_service_date));
 return api.roster_get(p_actor_id,day.operational_day_id);
end $$;

create or replace function api.roster_get(p_actor_id uuid,p_operational_day_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare day app_private.operational_days%rowtype;
begin select * into day from app_private.operational_days where operational_day_id=p_operational_day_id;
 if day.operational_day_id is null then raise exception 'not found' using errcode='P0002'; end if;
 perform app_private.require_roster_access(p_actor_id,'roster.read',day.service_region_id);
 return jsonb_build_object('operationalDay',to_jsonb(day),'entries',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('teamName',t.name,'vehicleName',v.display_name,'depotName',d.name,'staff',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('displayName',s.display_name) order by s.display_name) from app_private.daily_roster_staff_assignments a join app_private.staff s on s.staff_id=a.staff_id where a.daily_roster_entry_id=e.daily_roster_entry_id),'[]'::jsonb)) order by t.name) from app_private.daily_roster_entries e join app_private.teams t on t.team_id=e.team_id left join app_private.vehicles v on v.vehicle_id=e.assigned_vehicle_id left join app_private.depots d on d.depot_id=e.assigned_depot_id where e.operational_day_id=p_operational_day_id),'[]'::jsonb));
end $$;

create or replace function api.roster_find(p_actor_id uuid,p_service_region_id uuid,p_service_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare id uuid; begin perform app_private.require_roster_access(p_actor_id,'roster.read',p_service_region_id); select operational_day_id into id from app_private.operational_days where service_region_id=p_service_region_id and service_date=p_service_date; if id is null then return null; end if; return api.roster_get(p_actor_id,id); end $$;

create or replace function api.roster_validate(p_actor_id uuid,p_operational_day_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare day app_private.operational_days%rowtype; issues jsonb;
begin select * into day from app_private.operational_days where operational_day_id=p_operational_day_id; perform app_private.require_roster_access(p_actor_id,'roster.read',day.service_region_id);
 select coalesce(jsonb_agg(issue),'[]'::jsonb) into issues from (
  select jsonb_build_object('code','missing_vehicle','entryId',e.daily_roster_entry_id,'blocking',true) issue from app_private.daily_roster_entries e where e.operational_day_id=p_operational_day_id and e.entry_status='planned' and e.assigned_vehicle_id is null
  union all select jsonb_build_object('code','missing_driver','entryId',e.daily_roster_entry_id,'blocking',true) from app_private.daily_roster_entries e where e.operational_day_id=p_operational_day_id and e.entry_status='planned' and not exists(select 1 from app_private.daily_roster_staff_assignments a where a.daily_roster_entry_id=e.daily_roster_entry_id and a.assignment_role='driver')
  union all select jsonb_build_object('code','inactive_depot','entryId',e.daily_roster_entry_id,'blocking',true) from app_private.daily_roster_entries e join app_private.depots d on d.depot_id=e.assigned_depot_id where e.operational_day_id=p_operational_day_id and not d.is_active
 ) q;
 return jsonb_build_object('ready',jsonb_array_length(issues)=0,'issues',issues); end $$;

create or replace function api.roster_update_entry(p_actor_id uuid,p_entry_id uuid,p_body jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entry app_private.daily_roster_entries%rowtype; day app_private.operational_days%rowtype; assigned_vehicle uuid; assigned_depot uuid; reason text:=nullif(trim(p_body->>'reason'),''); staff_ids uuid[]; bounds tstzrange;
begin select * into entry from app_private.daily_roster_entries where daily_roster_entry_id=p_entry_id for update; select * into day from app_private.operational_days where operational_day_id=entry.operational_day_id for update;
 perform app_private.require_roster_access(p_actor_id,'roster.write',day.service_region_id);
 if day.lifecycle_status='locked' or day.lifecycle_status in ('closed','archived') then raise exception 'roster_locked' using errcode='55000'; end if;
 if (p_body->>'expectedUpdatedAt')::timestamptz<>entry.updated_at then raise exception 'stale_update' using errcode='40001'; end if;
 if day.lifecycle_status='active' and reason is null then raise exception 'reason_required' using errcode='22023'; end if;
 assigned_vehicle:=nullif(p_body->>'assignedVehicleId','')::uuid; assigned_depot:=nullif(p_body->>'assignedDepotId','')::uuid; staff_ids:=array(select jsonb_array_elements_text(coalesce(p_body->'staffIds','[]'))::uuid); bounds:=app_private.operational_day_bounds(day);
 if assigned_vehicle is not null and not exists(select 1 from app_private.vehicles v where v.vehicle_id=assigned_vehicle and v.service_region_id=day.service_region_id and v.is_active and v.operational_availability not in ('maintenance','unavailable','retired') and not exists(select 1 from app_private.vehicle_availability_windows w where w.vehicle_id=assigned_vehicle and tstzrange(w.starts_at,w.ends_at,'[)') && bounds)) then raise exception 'vehicle_unavailable' using errcode='22023'; end if;
 if exists(select 1 from app_private.daily_roster_entries e where e.operational_day_id=day.operational_day_id and e.daily_roster_entry_id<>p_entry_id and e.assigned_vehicle_id=assigned_vehicle and e.entry_status<>'cancelled') then raise exception 'vehicle_conflict' using errcode='23505'; end if;
 if assigned_depot is not null and not exists(select 1 from app_private.depots d where d.depot_id=assigned_depot and d.service_region_id=day.service_region_id and d.is_active) then raise exception 'invalid_depot' using errcode='22023'; end if;
 if exists(select 1 from unnest(staff_ids) sid where not exists(select 1 from app_private.staff s where s.staff_id=sid and s.is_active) or exists(select 1 from app_private.staff_availability_windows w where w.staff_id=sid and w.availability_status='unavailable' and tstzrange(w.starts_at,w.ends_at,'[)') && bounds)) then raise exception 'staff_unavailable' using errcode='22023'; end if;
 if exists(select 1 from app_private.daily_roster_staff_assignments a join app_private.daily_roster_entries e on e.daily_roster_entry_id=a.daily_roster_entry_id where e.operational_day_id=day.operational_day_id and e.daily_roster_entry_id<>p_entry_id and a.staff_id=any(staff_ids) and e.entry_status<>'cancelled') then raise exception 'staff_conflict' using errcode='23505'; end if;
 if (assigned_vehicle is distinct from entry.normal_vehicle_id or assigned_depot is distinct from entry.normal_depot_id or exists(select 1 from unnest(staff_ids) sid join app_private.staff s on s.staff_id=sid where s.default_team_id is distinct from entry.team_id)) and reason is null then raise exception 'reason_required' using errcode='22023'; end if;
 update app_private.daily_roster_entries set assigned_vehicle_id=assigned_vehicle,assigned_depot_id=assigned_depot,vehicle_is_substitution=assigned_vehicle is distinct from normal_vehicle_id,depot_is_override=assigned_depot is distinct from normal_depot_id,substitution_reason=reason,version=version+1,updated_at=now() where daily_roster_entry_id=p_entry_id returning * into entry;
 delete from app_private.daily_roster_staff_assignments where daily_roster_entry_id=p_entry_id;
 insert into app_private.daily_roster_staff_assignments(daily_roster_entry_id,staff_id,expected_team_id,assignment_role,is_substitution,substitution_reason) select p_entry_id,s.staff_id,s.default_team_id,s.operational_role,s.default_team_id is distinct from entry.team_id,case when s.default_team_id is distinct from entry.team_id then reason end from app_private.staff s where s.staff_id=any(staff_ids);
 perform app_private.record_roster_history(p_entry_id,p_actor_id,case when day.lifecycle_status='active' then 'active_assignment_changed' else 'substituted' end,reason);
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values(case when day.lifecycle_status='active' then 'daily_roster.post_start_assignment_changed' else 'daily_roster.substitution_made' end,p_actor_id,'daily-roster','roster-entry',p_entry_id,p_correlation_id,jsonb_build_object('version',entry.version,'reason',reason));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('daily-roster',case when day.lifecycle_status='active' then 'DailyRoster.ActiveAssignmentChanged' else 'DailyRoster.AssignmentSubstituted' end,1,'roster-entry',p_entry_id,jsonb_build_object('operationalDayId',day.operational_day_id,'entryId',p_entry_id,'version',entry.version),p_correlation_id,'user',p_actor_id::text,now());
 return app_private.roster_snapshot(p_entry_id); end $$;

create or replace function api.roster_transition(p_actor_id uuid,p_operational_day_id uuid,p_target text,p_expected_updated_at timestamptz,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare day app_private.operational_days%rowtype; validation jsonb; permission text; previous text;
begin select * into day from app_private.operational_days where operational_day_id=p_operational_day_id for update; previous:=day.lifecycle_status;
 permission:=case when p_target='locked' then 'roster.lock' when previous='locked' and p_target='ready' then 'roster.unlock' else 'roster.write' end; perform app_private.require_roster_access(p_actor_id,permission,day.service_region_id);
 if day.updated_at<>p_expected_updated_at then raise exception 'stale_update' using errcode='40001'; end if;
 if not ((previous='draft' and p_target='ready') or (previous='ready' and p_target in ('draft','locked')) or (previous='locked' and p_target in ('ready','active')) or (previous='active' and p_target in ('locked','closed')) or (previous='closed' and p_target='archived')) then raise exception 'invalid_transition' using errcode='22023'; end if;
 if p_target in ('ready','locked') then validation:=api.roster_validate(p_actor_id,p_operational_day_id); if not (validation->>'ready')::boolean then raise exception 'roster_not_ready' using errcode='22023'; end if; end if;
 if previous='locked' and p_target='ready' and nullif(trim(p_reason),'') is null then raise exception 'reason_required' using errcode='22023'; end if;
 update app_private.operational_days set lifecycle_status=p_target,locked_at=case when p_target='locked' then now() when previous='locked' and p_target='ready' then null else locked_at end,locked_by=case when p_target='locked' then p_actor_id when previous='locked' and p_target='ready' then null else locked_by end,closed_at=case when p_target='closed' then now() else closed_at end,archived_at=case when p_target='archived' then now() else archived_at end,updated_at=now() where operational_day_id=p_operational_day_id returning * into day;
 if previous='locked' and p_target='ready' then insert into app_private.daily_roster_unlocks(operational_day_id,unlocked_by,reason,previous_status) values(p_operational_day_id,p_actor_id,p_reason,previous); end if;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values('daily_roster.'||case when p_target='ready' then case when previous='locked' then 'unlocked' else 'marked_ready' end else p_target end,p_actor_id,'daily-roster','operational-day',p_operational_day_id,p_correlation_id,jsonb_build_object('previousStatus',previous,'status',p_target,'reason',p_reason));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values('daily-roster',case when previous='locked' and p_target='ready' then 'DailyRoster.RosterUnlocked' when p_target='ready' then 'DailyRoster.RosterReady' when p_target='locked' then 'DailyRoster.RosterLocked' else 'DailyRoster.RosterChanged' end,1,'operational-day',p_operational_day_id,jsonb_build_object('operationalDayId',p_operational_day_id,'previousStatus',previous,'status',p_target),p_correlation_id,'user',p_actor_id::text,now()); return to_jsonb(day); end $$;

create or replace function api.availability_list(p_actor_id uuid,p_service_region_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$ begin perform app_private.require_roster_access(p_actor_id,'roster.read',p_service_region_id); return jsonb_build_object('staff',coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('displayName',s.display_name)) from app_private.staff_availability_windows w join app_private.staff s on s.staff_id=w.staff_id where w.service_region_id=p_service_region_id and tstzrange(w.starts_at,w.ends_at,'[)') && tstzrange(p_from,p_to,'[)')),'[]'::jsonb),'vehicles',coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('displayName',v.display_name)) from app_private.vehicle_availability_windows w join app_private.vehicles v on v.vehicle_id=w.vehicle_id where w.service_region_id=p_service_region_id and tstzrange(w.starts_at,w.ends_at,'[)') && tstzrange(p_from,p_to,'[)')),'[]'::jsonb)); end $$;

create or replace function api.availability_save(p_actor_id uuid,p_kind text,p_id uuid,p_body jsonb,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare region_id uuid:=(p_body->>'serviceRegionId')::uuid; result jsonb; target_id uuid:=coalesce(p_id,gen_random_uuid());
begin perform app_private.require_roster_access(p_actor_id,'availability.manage',region_id);
 if p_kind='staff' then insert into app_private.staff_availability_windows(staff_availability_window_id,staff_id,service_region_id,starts_at,ends_at,full_day,availability_status,reason,note) values(target_id,(p_body->>'staffId')::uuid,region_id,(p_body->>'startsAt')::timestamptz,(p_body->>'endsAt')::timestamptz,coalesce((p_body->>'fullDay')::boolean,false),p_body->>'status',p_body->>'reason',p_body->>'note') on conflict(staff_availability_window_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,full_day=excluded.full_day,availability_status=excluded.availability_status,reason=excluded.reason,note=excluded.note,updated_at=now() returning to_jsonb(staff_availability_windows.*) into result;
 elsif p_kind='vehicle' then insert into app_private.vehicle_availability_windows(vehicle_availability_window_id,vehicle_id,service_region_id,starts_at,ends_at,availability_status,reason,note) values(target_id,(p_body->>'vehicleId')::uuid,region_id,(p_body->>'startsAt')::timestamptz,(p_body->>'endsAt')::timestamptz,p_body->>'status',p_body->>'reason',p_body->>'note') on conflict(vehicle_availability_window_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,availability_status=excluded.availability_status,reason=excluded.reason,note=excluded.note,updated_at=now() returning to_jsonb(vehicle_availability_windows.*) into result; else raise exception 'invalid_availability_kind' using errcode='22023'; end if;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,after_state) values(p_kind||'.availability_changed',p_actor_id,p_kind,'availability-window',target_id,p_correlation_id,jsonb_build_object('reason',p_body->>'reason'));
 insert into app_private.outbox_events(producer_module,event_name,event_version,aggregate_type,aggregate_id,payload,correlation_id,actor_kind,actor_id,occurred_at) values(case when p_kind='staff' then 'workforce' else 'vehicles' end,case when p_kind='staff' then 'Workforce.StaffAvailabilityChanged' else 'Vehicles.VehicleAvailabilityWindowChanged' end,1,'availability-window',target_id,jsonb_build_object('availabilityWindowId',target_id,'serviceRegionId',region_id),p_correlation_id,'user',p_actor_id::text,now()); return result; end $$;

create or replace function api.availability_delete(p_actor_id uuid,p_kind text,p_id uuid,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare region_id uuid; result jsonb;
begin
 if p_kind='staff' then select service_region_id,to_jsonb(w) into region_id,result from app_private.staff_availability_windows w where staff_availability_window_id=p_id for update;
 elsif p_kind='vehicle' then select service_region_id,to_jsonb(w) into region_id,result from app_private.vehicle_availability_windows w where vehicle_availability_window_id=p_id for update;
 else raise exception 'invalid_availability_kind' using errcode='22023'; end if;
 if region_id is null then raise exception 'not found' using errcode='P0002'; end if; perform app_private.require_roster_access(p_actor_id,'availability.manage',region_id);
 if p_kind='staff' then delete from app_private.staff_availability_windows where staff_availability_window_id=p_id; else delete from app_private.vehicle_availability_windows where vehicle_availability_window_id=p_id; end if;
 insert into app_private.business_audit_facts(action_key,actor_id,module_key,target_type,target_id,correlation_id,before_state) values(p_kind||'.availability_removed',p_actor_id,p_kind,'availability-window',p_id,p_correlation_id,result); return result; end $$;

revoke all on function api.roster_generate(uuid,uuid,date,uuid),api.roster_get(uuid,uuid),api.roster_find(uuid,uuid,date),api.roster_validate(uuid,uuid),api.roster_update_entry(uuid,uuid,jsonb,uuid),api.roster_transition(uuid,uuid,text,timestamptz,text,uuid),api.availability_list(uuid,uuid,timestamptz,timestamptz),api.availability_save(uuid,text,uuid,jsonb,uuid),api.availability_delete(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function api.roster_generate(uuid,uuid,date,uuid),api.roster_get(uuid,uuid),api.roster_find(uuid,uuid,date),api.roster_validate(uuid,uuid),api.roster_update_entry(uuid,uuid,jsonb,uuid),api.roster_transition(uuid,uuid,text,timestamptz,text,uuid),api.availability_list(uuid,uuid,timestamptz,timestamptz),api.availability_save(uuid,text,uuid,jsonb,uuid),api.availability_delete(uuid,text,uuid,uuid) to service_role;
