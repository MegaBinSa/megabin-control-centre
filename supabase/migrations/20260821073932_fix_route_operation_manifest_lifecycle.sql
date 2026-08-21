-- Manifest revisions preserve immutable assignment and stop content. Lifecycle is
-- mutable execution state owned by route_operations, so every manifest read must
-- overlay the current authoritative value without creating a new revision.
create or replace function app_private.route_operation_manifest_document(
  p_operation_id uuid,
  p_revision integer default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select m.manifest_document
    || jsonb_build_object(
      'lifecycleStatus', o.lifecycle_status,
      'stops', coalesce((
        select jsonb_agg(jsonb_build_object(
          'routeOperationStopId', s.route_operation_stop_id,
          'sourcePlannedRouteStopId', s.source_planned_route_stop_id,
          'sequenceNumber', s.sequence_number,
          'serviceAddressId', s.service_address_id,
          'territoryId', s.territory_id,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'address', s.address_snapshot,
          'serviceFlags', s.service_flags,
          'plannedDrumUnits', s.planned_drum_units,
          'plannedDurationMinutes', s.planned_duration_minutes
        ) order by s.sequence_number)
        from app_private.route_operation_stops s
        where s.route_operation_id = m.route_operation_id
      ), '[]'::jsonb)
    )
  from app_private.route_operation_manifests m
  join app_private.route_operations o using (route_operation_id)
  where m.route_operation_id = p_operation_id
    and m.manifest_revision = coalesce(p_revision, o.manifest_revision)
$$;

revoke all on function app_private.route_operation_manifest_document(uuid, integer)
from public, anon, authenticated;
