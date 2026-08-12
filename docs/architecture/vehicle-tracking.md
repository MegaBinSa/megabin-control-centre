# Vehicle Tracking architecture

**Status:** Phase 3B foundation implemented

## Ownership and model

Vehicle Tracking owns tracking devices, device-to-vehicle assignment history, immutable location observations, ingestion receipts, and the derived current-position projection. Vehicles, Teams, Daily Roster, and Route Operations remain authoritative for their own identities and assignments. A location observation may reference current operational context, but it never changes route progress or infers arrival, deviation, ETA, or the next stop.

Device identity is an immutable internal UUID. Provider references, hardware references, phone numbers, and credential references are alternate metadata, never primary keys. Lifecycle is `registered -> active <-> suspended -> revoked/retired`. Revocation prevents further ingestion. Registration stores only a secret-store credential reference; reusable plaintext credentials are prohibited from normal tables.

Assignments are effective-dated history. A device and a vehicle may each have at most one current primary assignment. Reassignment closes conflicting current assignments before creating a reasoned, audited replacement.

## Observation and ordering contract

Each observation carries an immutable observation ID, device-recorded timestamp, server receipt timestamp, coordinates, accuracy, optional altitude/heading/speed, client sequence, idempotency key, correlation ID, and provider-neutral source. PostGIS `geography(Point,4326)` supports future spatial use while numeric coordinates support simple clients.

Device time is preserved. Server time measures receipt latency and health. Configurable policy rejects malformed coordinates/accuracy, excessive future skew, and observations older than the ingestion window. Poor but permitted accuracy is retained with a quality signal. Client sequence is diagnostic only.

The current-position projection advances only when `(recorded_at, server_received_at, observation_id)` sorts after the existing value. Consequently, late offline points remain in immutable history without moving the current marker backwards.

## Authentication and API boundary

Driver PWA ingestion requires Supabase user authentication, the `vehicle_tracking.ingest` permission, current team/region scope, ownership of the active device, and an active vehicle assignment. Office reads and administration require granular permissions plus region scope. Raw observations, receipts, assignments, and projections remain in `app_private`; browser roles have no direct grants. Fixed application RPCs re-authorize each operation.

External devices/providers can later normalize into the same observation contract through an integration adapter and approved credential mechanism. No production provider is selected in Phase 3B.

## Driver capture and offline buffer

The Driver PWA uses foreground browser geolocation on a configurable target interval (45 seconds locally). Observations persist in a separate IndexedDB queue, upload in batches of at most 100, survive reloads, and retain rejected/conflicting receipts. Storage is bounded to a configurable target of 1,000 unsynced observations; if pressure exceeds the bound, deterministic interval sampling retains representative movement rather than exhausting storage. Recent synced receipts are retained for diagnostics. Logout clears route and location stores.

Standard browser/PWA geolocation cannot guarantee 30–60 second collection while backgrounded, suspended, or phone-locked. Capture failure does not block route execution. Continuous background guarantees may later require a native wrapper, dedicated app, managed agent, or external GPS device—all using the same server contract.

## Current position and health

Office uses the narrow current-position API with 30-second polling. Realtime is intentionally deferred: polling is simpler at current scale and is the required fallback even if narrow Realtime updates are added later. Raw GPS rows are never streamed to browsers.

Health is derived at read time from device lifecycle and configurable age thresholds: `healthy`, `delayed`, `stale`, `offline`, `suspended`, `revoked`, or `unknown`. It does not use route interpretation. Device last contact and last successful position are updated without generating a business audit record for every point.

## Privacy, retention, and observability

Location is sensitive operational data used to locate MegaBin vehicles and diagnose tracking availability. The model permits all-hours collection when device/app authorization and operating policy allow it; route completion does not disable tracking. Employee notice, consent, after-hours operating policy, and the production retention period require human/legal approval.

Raw retention is configurable and no destructive job is enabled in Phase 3B. The placeholder default is not an approved production policy. Current positions may have a different retention lifecycle. Administrative device/lifecycle/assignment changes are audited; individual points are not. Safe diagnostics use counts, batch size, receipt outcome, timestamp lag, accuracy quality, and last contact without copying location history into general logs.
