# Office vehicle tracking workflow

1. Open **Live Vehicles** and choose an authorized service region.
2. Review all regional vehicles in the map and compact tracking-status table.
3. Select a marker or table row to inspect coordinates, timestamp age, accuracy, health, team, current Route Operation reference, and assigned device.
4. Register a device using an internal name, provider reference, type, owner where applicable, and secret-store credential reference.
5. Activate, suspend, revoke, or retire the device with a reason.
6. Assign or reassign it to a same-region vehicle; prior current assignments are closed and remain in history.
7. Investigate delayed/stale/offline status without treating it as route deviation or a business alert.

The screen polls the current-position projection every 30 seconds. It never reads raw location history.
