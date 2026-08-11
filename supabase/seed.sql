-- Local-only deterministic synthetic fixtures. Never replace these with
-- production client data or real recipient details.
insert into app_private.service_regions (service_region_id, name, region_code)
values ('51000000-0000-0000-0000-000000000001', 'Pretoria Test Region', 'PTA-TEST')
on conflict do nothing;

insert into app_private.depots (
  depot_id, service_region_id, name, address_line_1, suburb, city,
  latitude, longitude, geofence_radius_metres
) values (
  '52000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  'Synthetic Central Depot', '1 Test Road', 'Test Suburb', 'Pretoria',
  -25.747900, 28.229300, 150
) on conflict do nothing;

insert into app_private.territories (
  territory_id, service_region_id, name, priority, default_depot_id, boundary
) values
  (
    '53000000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001', 'Synthetic North', 10,
    '52000000-0000-0000-0000-000000000001',
    extensions.st_multi(extensions.st_geomfromtext(
      'POLYGON((28.20 -25.75,28.30 -25.75,28.30 -25.65,28.20 -25.65,28.20 -25.75))', 4326
    ))
  ),
  (
    '53000000-0000-0000-0000-000000000002',
    '51000000-0000-0000-0000-000000000001', 'Synthetic Priority Overlap', 20,
    '52000000-0000-0000-0000-000000000001',
    extensions.st_multi(extensions.st_geomfromtext(
      'POLYGON((28.25 -25.72,28.35 -25.72,28.35 -25.62,28.25 -25.62,28.25 -25.72))', 4326
    ))
  ) on conflict do nothing;

insert into app_private.teams (team_id, service_region_id, default_depot_id, team_code, name)
values (
  '54000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001', 'TEAM-A', 'Synthetic Team A'
) on conflict do nothing;

insert into app_private.staff (staff_id, display_name, mobile_e164, operational_role, default_team_id)
values (
  '55000000-0000-0000-0000-000000000001', 'Synthetic Driver', '+27820000001',
  'driver', '54000000-0000-0000-0000-000000000001'
) on conflict do nothing;

insert into app_private.vehicles (
  vehicle_id, service_region_id, default_depot_id, default_team_id,
  registration_reference, display_name, estimated_drum_capacity
) values (
  '56000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000001', 'TEST-001-GP',
  'Synthetic Collection Vehicle', 40
) on conflict do nothing;

update app_private.teams
set normal_vehicle_id = '56000000-0000-0000-0000-000000000001'
where team_id = '54000000-0000-0000-0000-000000000001';

insert into app_private.clients (client_id, client_type, display_name)
values
  ('57000000-0000-0000-0000-000000000001', 'individual', 'Synthetic Client One'),
  ('57000000-0000-0000-0000-000000000002', 'individual', 'Synthetic Client Two')
on conflict do nothing;

insert into app_private.service_addresses (
  service_address_id, address_line_1, suburb, city, latitude, longitude
) values (
  '58000000-0000-0000-0000-000000000001', '10 Shared Test Street',
  'Test Suburb', 'Pretoria', -25.750000, 28.240000
) on conflict do nothing;

insert into app_private.client_services (
  client_service_id, client_id, service_address_id, service_start_date
) values
  ('59000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', current_date),
  ('59000000-0000-0000-0000-000000000002', '57000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', current_date),
  ('59000000-0000-0000-0000-000000000003', '57000000-0000-0000-0000-000000000002', '58000000-0000-0000-0000-000000000001', current_date)
on conflict do nothing;

insert into app_private.service_configurations (
  client_service_id, service_region_id, territory_id, territory_is_override,
  depot_id, default_team_id, configured_drum_count, operational_drum_unit_count,
  configured_collection_day, effective_from
) values
  ('59000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', false, '52000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000001', 2, 2, 1, current_date),
  ('59000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002', true, '52000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000001', 1, 1, 3, current_date),
  ('59000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', false, '52000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000001', 1, 1, 5, current_date)
on conflict do nothing;
