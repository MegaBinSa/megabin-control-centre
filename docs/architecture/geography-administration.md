# Geography administration

## Scope and ownership

Geography owns territory geometry, priority, depot geographic configuration, spatial suggestion queries, territory changes, and geography-assignment reviews. Service Configuration owns permanent service-to-territory assignments. A geography review confirmation calls the Service Configuration application boundary; territory edits never silently reassign services.

Service Regions remain logical access and operating containers. Phase 1C does not invent region polygons. If explicit region boundaries become an operational requirement, they must use the same controlled PostGIS and optimistic-concurrency pattern.

## Map-provider boundary

`@megabin/geography` defines provider-neutral markers, Polygon/MultiPolygon features, coordinate conversion, drawing, editing, bounds, and interaction contracts. Office currently uses a lightweight SVG administrative adapter. It is sufficient for synthetic administration workflows and keeps external map SDK types out of domain/API code. A future basemap provider can replace the adapter without changing API contracts. Directions, traffic, geocoding, tracking, and route optimization are outside this boundary.

## GeoJSON, priority, and overlap

Territory endpoints accept RFC 7946-style `Polygon` or `MultiPolygon` JSON with longitude/latitude positions. PostgreSQL stores authoritative `geometry(MultiPolygon, 4326)`. PostGIS rejects malformed, empty, unsupported, and invalid topology. API reads serialize geometry as GeoJSON. Frontend checks are assistance only.

Only active territories with active service availability participate. For a point, the highest numeric priority is suggested. Equal highest priorities are ambiguous and produce no suggestion. A permanent Service Configuration override wins over a spatial suggestion. Overlap is permitted and reported with approximate geodesic square metres; it is never silently removed or reprioritized.

Spatial predicates retain indexed geometry expressions (`&&`, `ST_Intersects`, and `ST_Covers`) so GiST indexes remain usable.

## Change and review workflow

1. Office loads authoritative geometry and `updatedAt`.
2. Draw/edit changes only a browser draft.
3. PostGIS validates and impact preview identifies affected active geocoded services.
4. Explicit save checks `updatedAt`, records a territory change, writes audit facts/events, and creates review records.
5. Confirm invokes the Service Configuration-owned effective-dated assignment helper; dismissal preserves the assignment.
6. Permanent overrides are explicit, audited, and do not expire. Removing one returns to the current unambiguous spatial suggestion.

Reviews are a Geography queue, not general Needs Attention items. Events contain identifiers, not geometry or client details.

## Security

Fixed `/api/v1/geography/*` application endpoints authenticate callers and enforce `geography.read`/`geography.write` plus service-region scope. Geography tables and RPCs are not granted to authenticated browser roles. Driver/Team receives no geography administration permission. Map address markers expose identifiers and geographic validation state, not client/contact details.
