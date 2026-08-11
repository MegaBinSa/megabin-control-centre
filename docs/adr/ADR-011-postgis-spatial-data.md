# ADR-011: PostGIS for Spatial and Geographic Data

**Status:** Accepted

## Context

Territories, containment, geofences, distances, routes, depots, dumps, service addresses, and tracking require first-class spatial data.

## Decision

Use PostgreSQL/PostGIS for authoritative MegaBin geographic entities and spatial operations. Store structured human-readable address data separately from immutable IDs and geographic coordinates.

## Consequences

- Spatial types, coordinate reference, validation, and indexes must be standardized before Phase 1 schema work.
- Mapping providers supply calculations but do not own MegaBin geographic records.
- Mutable address text is never an entity key.

## Rejected alternatives

- Suburb-name matching as the long-term geographic model.
- Provider place IDs or address strings as primary keys.
- A separate spatial database at current scale.

