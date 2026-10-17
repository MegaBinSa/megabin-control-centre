-- Require the financial eligibility permission before returning even an empty
-- scoped projection. Authorized actors remain constrained by their region scopes.
create or replace function app_private.financial_eligibility_has_permission(
  p_actor uuid,
  p_permission text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles profile
    join app_private.user_roles user_role on user_role.user_id = profile.user_id
    join app_private.role_permissions role_permission on role_permission.role_id = user_role.role_id
    where profile.user_id = p_actor
      and profile.is_active
      and role_permission.permission_key = p_permission
  );
$$;

create or replace function api.financial_eligibility_list(
  p_actor uuid,
  p_query jsonb default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.financial_eligibility_has_permission(
    p_actor,
    'financial_eligibility.read'
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'decisionId', decision.financial_eligibility_decision_id,
            'clientId', decision.client_id,
            'clientServiceId', decision.client_service_id,
            'clientName', client.display_name,
            'serviceAddress', concat_ws(', ', address.address_line_1, address.suburb),
            'serviceRegionId', decision.service_region_id,
            'accountStatus', snapshot.derived_status,
            'freshness', case
              when snapshot.client_id is null then 'missing'
              when now() > snapshot.stale_after then 'stale'
              else 'current'
            end,
            'decisionStatus', decision.decision_status,
            'reasonCode', decision.reason_code,
            'decisionVersion', decision.decision_version,
            'activeHold', hold.financial_hold_id is not null,
            'override', case
              when override.financial_eligibility_override_id is null then null
              else jsonb_build_object(
                'status', override.override_status,
                'reason', override.reason,
                'version', override.version
              )
            end,
            'lastReevaluated', decision.created_at
          ) order by decision.created_at desc
        ),
        '[]'
      )
      from app_private.financial_eligibility_decisions decision
      join app_private.clients client using (client_id)
      join app_private.client_services service using (client_service_id)
      join app_private.service_addresses address
        on address.service_address_id = service.service_address_id
      left join app_private.client_accounting_snapshots snapshot
        on snapshot.client_id = decision.client_id
      left join app_private.financial_holds hold
        on hold.client_service_id = decision.client_service_id
       and hold.lifecycle_status = 'active'
      left join app_private.financial_eligibility_overrides override
        on override.client_service_id = decision.client_service_id
       and override.revoked_at is null
      where decision.effective_until is null
        and app_private.user_has_region_permission(
          p_actor,
          'financial_eligibility.read',
          decision.service_region_id
        )
        and (
          nullif(p_query->>'serviceRegionId', '') is null
          or decision.service_region_id = (p_query->>'serviceRegionId')::uuid
        )
        and (
          nullif(p_query->>'status', '') is null
          or decision.decision_status = p_query->>'status'
        )
    )
  );
end;
$$;

revoke all on function app_private.financial_eligibility_has_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.financial_eligibility_has_permission(uuid, text)
  to service_role;
