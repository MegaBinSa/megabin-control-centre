-- Require the accounting permission before returning even an empty scoped projection.
-- Row filtering remains region-aware after this aggregate authorization gate.
create or replace function app_private.accounting_has_permission(
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

create or replace function api.accounting_status_list(
  p_actor uuid,
  p_query jsonb default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.accounting_has_permission(p_actor, 'accounting.read') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'clientId', snapshot.client_id,
            'clientName', client.display_name,
            'serviceRegionId', snapshot.service_region_id,
            'accountStatus', coalesce(
              exception.override_status,
              case when now() > snapshot.stale_after then 'unknown' else snapshot.derived_status end
            ),
            'derivedStatus', snapshot.derived_status,
            'isStale', now() > snapshot.stale_after,
            'reconciliationStatus', snapshot.reconciliation_status,
            'lastSync', snapshot.provider_synced_at,
            'exception', case
              when exception.accounting_status_exception_id is null then null
              else jsonb_build_object(
                'status', exception.override_status,
                'reason', exception.reason,
                'effectiveUntil', exception.effective_until
              )
            end
          ) order by client.display_name
        ),
        '[]'
      )
      from app_private.client_accounting_snapshots snapshot
      join app_private.clients client using (client_id)
      left join app_private.accounting_status_exceptions exception
        on exception.client_id = snapshot.client_id
       and exception.revoked_at is null
       and (exception.effective_until is null or exception.effective_until > now())
      where app_private.user_has_region_permission(
        p_actor,
        'accounting.read',
        snapshot.service_region_id
      )
        and (
          nullif(p_query->>'status', '') is null
          or coalesce(
            exception.override_status,
            case when now() > snapshot.stale_after then 'unknown' else snapshot.derived_status end
          ) = p_query->>'status'
        )
    )
  );
end;
$$;

revoke all on function app_private.accounting_has_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.accounting_has_permission(uuid, text) to service_role;
