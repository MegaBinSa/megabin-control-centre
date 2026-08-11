# MegaBin Control Centre
## System Blueprint & Prioritised Development Roadmap

**Status:** Authoritative baseline specification  
**Platform:** Supabase  
**Architecture:** Modular monolith, API-first, event-driven where appropriate  
**Primary principle:** One operational source of truth  
**Prepared for:** Codex implementation

---

# 1. Executive Summary

MegaBin Control Centre will be the central operating system for MegaBin's field operations. Its first major operational focus is the integrated management of:

1. **Vehicle visibility** — continuous vehicle location, route progress, device health, alerts and operational exception detection.
2. **Route optimisation** — automated daily route generation based primarily on lowest total distance, constrained by territory, collection day, team/vehicle availability, capacity, depots and approved dump sites.
3. **Client communications** — automated collection-day notifications, SKIP requests, fallback communication channels, operational broadcasts and future account/service notices.

These capabilities must not be built as isolated tools. They will sit on top of one master operational database and shared domain model so future modules such as accounting integration, vehicle maintenance, fuel, reporting, staff/roster management and additional service regions can plug into the same foundation without duplicating data or business logic.

The system should therefore be treated as a **platform**, not as a route-planning app.

---

# 2. Non-Negotiable Architectural Principles

## 2.1 One source of operational truth

The Control Centre master database becomes the authoritative source for activated clients and MegaBin operational data.

External systems may provide source data, but they do not get unrestricted write access to the master database.

Examples:

- Website onboarding owns initial signup submissions until activation.
- Control Centre owns activated-client operational data.
- Accounting system owns financial/account balances and payment truth.
- Control Centre derives operational consequences such as Active / On Hold / Cancelled.
- GPS/tracking provider owns raw telemetry submissions.
- Control Centre owns current vehicle operational state.
- Google Maps supplies geocoding/routing calculations but owns no MegaBin business records.
- WhatsApp/SMS/email providers own delivery events, not MegaBin communication rules.

## 2.2 Modular monolith first

The backend should initially be one deployable application and one primary PostgreSQL database, but internally separated into strict modules/domains.

This avoids premature microservice complexity while preserving future extractability.

Rules:

- Each module has explicit ownership of its authoritative entities.
- Non-owning modules may read shared master data directly where appropriate.
- Writes to authoritative records must go through the owning module's domain/service logic.
- Circular module dependencies are prohibited.
- Package/import boundaries should be enforced through codebase rules where practical.

## 2.3 API-first

Both first-party frontends and external integrations should use stable application interfaces.

- Version APIs from the start, e.g. `/api/v1/...`.
- Publish machine-readable OpenAPI documentation.
- Generate API documentation from actual backend contracts where practical.
- Breaking changes require a new major API version.
- Existing API versions should follow a defined deprecation window.

## 2.4 Event-driven where useful

Important domain state changes should emit durable domain events, e.g.:

- `ClientActivated`
- `ClientPlacedOnHold`
- `RoutePublished`
- `RouteStarted`
- `RouteReoptimised`
- `StopArrived`
- `StopCompleted`
- `SkipRequested`
- `SkipApproved`
- `VehicleNearCapacity`
- `DumpRequested`
- `DumpCompleted`
- `VehicleUnavailable`
- `OperationalIssueCreated`
- `OperationalIssueResolved`

Use an **outbox pattern** so domain changes and event publication cannot drift apart.

The event system must support:

- Durable event storage before dispatch.
- Retry handling.
- Dead-letter handling.
- Idempotent consumers.
- Event versioning.
- Replay controls for authorised technical users.

## 2.5 Integration adapters

Every external integration must sit behind an adapter/connector layer so providers can be replaced without rewriting core business logic.

Each integration must declare:

- Purpose.
- Data ownership.
- Permitted inbound fields.
- Permitted outbound events/actions.
- Authentication method.
- Retry policy.
- Health check.
- Failure behaviour.
- Conflict behaviour.
- Decommissioning dependencies.

Technical enforcement should prevent an integration from writing outside its allowed scope.

## 2.6 Supabase-first platform design

Use Supabase as the platform foundation:

- PostgreSQL master database.
- Supabase Auth.
- Row Level Security.
- Supabase Storage for operational evidence photos.
- Realtime for appropriate operational state changes.
- Edge Functions for externally facing integration logic and backend workflows where appropriate.
- Scheduled backend jobs for timed workflows.
- Version-controlled database migrations.

Use PostgreSQL/PostGIS capabilities for geospatial data and territory modelling.

High-frequency GPS telemetry should not be broadcast indiscriminately through Realtime. Store raw telemetry separately and update a lightweight current-state record used by Realtime dashboards.

---

# 3. Repository & Development Structure

Use a **single monorepo**.

Recommended logical structure:

```text
/apps
  /office-web
  /driver-pwa
/packages
  /ui
  /api-client
  /domain-types
  /validation
  /permissions
  /events
  /config
  /testing
/supabase
  /migrations
  /functions
  /seed
  /tests
/docs
  /architecture
  /adr
  /api
  /domain
  /workflows
  /roadmap
```

The office app and driver PWA are **separate frontends** sharing a design system, types, validation, API client and permission utilities.

---

# 4. System Modules

The system should be divided into these bounded modules.

## 4.1 Identity & Access

Owns:

- Users.
- Roles.
- Granular permissions.
- User-role assignments.
- Registered driver devices.
- Session/device revocation.
- MFA policy.

Primary roles initially:

- Director/Admin.
- Operations Manager.
- Office/Admin.
- Driver/Team.
- System Admin/Developer.

Support custom roles created from granular permissions.

Security rules:

- Least privilege by default.
- Users can only grant permissions they possess.
- System-level technical privileges are separate from business Director/Admin privileges.
- System Admin/Developer does not automatically inherit client financial access.
- Mandatory MFA for Director/Admin and System Admin/Developer.
- Optional MFA for lower-privilege users.
- Recent re-authentication required for high-risk actions.

## 4.2 Client & Service Management

Owns activated-client operational master data.

Core fields include:

- Internal immutable client/service identifiers.
- Customer type.
- Full name / organisation metadata for office use.
- Contact details.
- Service address components.
- Latitude/longitude.
- Service region.
- Territory.
- Depot.
- Collection day.
- Normal team.
- Territory override.
- Number of configured drums.
- Account operational status.
- Drum placement.
- Access notes.
- Security instructions.
- Dangerous animal flag.
- Stairs/elevation notes.
- Internal office notes.
- Preferred language.
- Lifecycle status.

The user-facing address may be treated operationally as the recognisable identifier, but the database must use immutable internal IDs because addresses can change and multiple clients may occupy one physical address.

Account statuses initially:

- Pending.
- Active.
- On Hold.
- Cancelled.
- Archived.

On Hold and Cancelled clients are excluded from normal route generation.

## 4.3 Onboarding & Imports

Owns:

- Website signup ingestion.
- Pending-client review.
- Geocoding validation.
- Suggested region/depot/territory/day/team.
- CSV/Excel imports.
- Spreadsheet transition sync.
- Import batches.
- Duplicate review.
- Import rollback.

Website flow:

1. Website submits signup.
2. Control Centre creates Pending Client.
3. Address is validated/geocoded.
4. System suggests region, depot, territory, collection day and team.
5. Office confirms/changes assignment.
6. Client is activated.
7. Control Centre becomes authoritative.
8. Website ceases to be authoritative for that activated client.

Existing spreadsheet transition:

- Scheduled recurring inbound sync is supported temporarily.
- Only explicitly configured spreadsheet-owned fields may update records.
- Conflicting Control Centre-owned fields enter Sync Conflicts.
- Every sync creates a batch record while the integration is active.
- Sync can be paused.
- Integration can later be decommissioned.
- Decommissioning removes its historical sync/import records as explicitly decided, while transferred client records remain intact.
- Decommissioning requires Director/Admin confirmation, reason and a dependency checklist.

Duplicate handling:

- Detect probable duplicates using address, mobile and email combinations.
- Never auto-merge.
- Show existing vs incoming record side-by-side.
- Allow Keep Existing / Use Incoming / Merge Selected Fields.
- Preserve merged/retired records as archived records.

## 4.4 Regions, Depots & Territories

Owns:

- Service regions.
- Depots.
- Territories.
- Geographic polygons.
- Overlap priority.
- Default operating configuration.

Region hierarchy:

```text
Service Region
  -> Depot(s)
  -> Territory(ies)
  -> Eligible Teams/Vehicles
  -> Clients
```

Territories must support:

- Editable map polygons.
- Configurable priority when polygons overlap.
- Default depot.
- Preferred collection days.
- Eligible teams/vehicles.
- Active/inactive service status.
- Temporary/permanent individual client territory override.

Changing a polygon does not automatically reassign existing clients. Affected clients are flagged for office review.

## 4.5 Teams, Staff & Daily Roster

Owns:

- Teams.
- Driver directory.
- Permanent assignments.
- Daily operational roster.
- Temporary substitutions.
- Staff availability/leave relevant to routing.

Daily roster:

- Generated from permanent assignments each morning.
- Supports one-day driver, team and vehicle overrides.
- Override reason mandatory.
- Can be locked when operations start.
- Unlocking after operations begin requires an authorised user and reason.
- Preserves actual team/driver/vehicle combination used historically.

Staff absence:

- Planned full-day or partial-day absence supported.
- Unavailable staff excluded from daily roster/route assignment.

## 4.6 Vehicles

Owns:

- Vehicle master records.
- Default depot.
- Normal team.
- Estimated drum capacity.
- Working hours.
- Availability.
- Maintenance schedule.
- Odometer records.
- Compliance dates.
- Tracking-device assignment.

Vehicle statuses:

- Available.
- In Service.
- Maintenance.
- Unavailable.
- Retired.

Only Available vehicles may be automatically assigned routes.

If a vehicle becomes unavailable while assigned work exists, warn the office but do not automatically reassign.

Vehicle-specific configuration includes:

- Estimated maximum drum units.
- Daily capacity.
- Working-hour window.
- After-hours grace period.
- Tracking-offline threshold.
- Low-battery threshold.
- Route deviation thresholds.
- Stationary thresholds.

Maintenance:

- Vehicle can use one selected maintenance interval method: kilometres or time.
- Planned maintenance windows remove vehicle from availability.
- Maintenance type/reason and optional notes supported.
- No dedicated accident/incident-history module initially.

Compliance:

- Store licence/roadworthy/insurance-style expiry metadata.
- No actual document uploads initially.
- Dedicated vehicle compliance view.
- Configurable warning period per document type.
- Compliance does not enter central Needs Attention unless later changed.

Future provision:

- Fuel records.
- Manual fuel entries.
- Fuel-card/provider adapter.
- Consumption analytics.
- Per-vehicle consumption thresholds.

## 4.7 Tracking & Telemetry

Owns:

- Raw GPS points.
- Current vehicle location.
- Device health.
- Device battery.
- Last update.
- Movement/geofence interpretation.

Each MegaBin-owned phone is permanently associated with a vehicle unless changed by an authorised user.

Tracking requirements:

- Always on when phone/device is powered and connected.
- 30–60 second update interval target.
- Continues outside working hours.
- Local buffering when offline.
- Buffered GPS points uploaded after connectivity returns.
- Dedicated tracking component/app permitted if PWA background behaviour is insufficient.

Data structure:

```text
vehicle_location_history
  raw time-series points

vehicle_current_state
  one current row per vehicle
  latest location
  last update
  battery
  tracking status
  movement status
  route relationship
```

Do not make core route/client actions depend on high-frequency GPS writes succeeding.

GPS retention: **6 months**.

Automatically delete raw points older than six months.

Allow authorised export of GPS history before deletion.

## 4.8 Route Planning & Optimisation

Owns:

- Route plans.
- Route versions.
- Route stops.
- Stop sequence.
- Route assignments.
- Route publication.
- Re-optimisation.
- Capacity calculations.
- Dump insertions.

### Optimisation objective

Primary objective: **lowest total driving distance**.

Do not optimise route order primarily for live traffic.

Do not depend on Google travel-time estimates for MegaBin timing metrics.

Timing estimates should use configurable MegaBin assumptions initially and historical MegaBin performance later.

### Daily generation

- Run automatically every day at **07:00**.
- Generate and publish immediately.
- Do not wait for office approval.
- Office can adjust afterward.
- If overloaded, publish but prominently flag.
- If generation fails, retain the most recently valid route as fallback and alert system administrators.
- Provide manual `Generate Routes Now` retry.

### Route inclusion

All eligible clients assigned to the relevant collection day and operating area are included unless excluded by:

- Account hold.
- Cancellation.
- Approved skip.
- Service exception.
- Explicit office override.

### Constraints

Route planning must account for:

- Fixed collection day.
- Service region.
- Territory.
- Territory overlap priority.
- Eligible teams.
- Team/vehicle availability.
- Vehicle capacity.
- Daily team capacity.
- Number of drums.
- Expected working hours.
- Depot start/end.
- Approved dump sites.
- Planned staff/vehicle availability.
- One-day assignment overrides.

### Capacity

Each drum = one capacity unit.

Each vehicle has configurable estimated capacity.

Each team can have configurable daily capacity.

Capacity differs across teams depending on operating context and distance.

### Route overload handling

If route generation exceeds capacity or expected operating window:

1. Warn office.
2. Suggest stops that could move to nearby eligible teams.
3. Prioritise transfer producing least added distance where the alternative team has capacity/time.
4. Never automatically reschedule when no valid capacity exists.
5. Route still publishes and is flagged for intervention.

### Dynamic re-optimisation

Automatic when:

- SKIP approved.
- Stop added.
- Stop moved between teams.
- Dump inserted.
- One-day reassignment changes remaining work.

During active operations:

- Preserve completed stops.
- Preserve current vehicle position.
- Recalculate only remaining work.
- Notify driver/team that route changed.
- No driver acknowledgement required.

Manual `Regenerate All Routes`:

- Director/Admin and Operations Manager.
- Confirmation required.
- If active, preserve completed work/current positions.
- Show preview of proposed major changes before commit.

### Route versioning

Every generated/re-optimised route produces a version.

Keep route versions for **6 months**.

The active version is clearly designated.

Long-term service history remains independent of route-version retention.

## 4.9 Route Operations / Driver PWA

Owns field interaction state, not master business records.

Driver interface shows:

- Entire day's route.
- Map + ordered list.
- Address.
- Number of drums.
- Drum placement.
- Access notes.
- Security instructions.
- Dangerous-animal warning.
- Stairs/elevation notes.
- Stop status.
- Progress.
- Estimated capacity.
- Estimated completion time using MegaBin timing model.

Driver must **not** see:

- Client name by default.
- Client mobile number.
- Email.
- Monthly amount.
- Pricing.
- Debit order/payment details.
- Internal office notes.

Navigation:

- `Navigate in Google Maps` action.
- No custom turn-by-turn engine in first version.

### Arrival detection

- Automatically detect entry into configurable client geofence.
- Default radius is configurable globally.
- Client/dump/depot-specific radii may override defaults where relevant.
- Arrival creates stop in-progress state.
- Outcome remains manual.

### Stop outcomes

- Cleaned.
- Client requested skip.
- Drum empty.
- Drum unavailable.
- Could not access property.
- Drum missing.
- Account hold.
- Other issue.

Photo rules:

- Cleaned: photo not required.
- All other outcomes: photo required.
- Other issue: photo + written description required.

Issue creation automatically for:

- Drum unavailable.
- Could not access property.
- Drum missing.
- Unexpected Account Hold.
- Other issue.

Do not create Operational Issues automatically for normal SKIP or Drum Empty.

Could Not Access automatically stores GPS/time verification.

### Actual drum count

Track configured drum count separately from actual serviced drum count.

Driver can record more or fewer drums than configured.

No reason required solely because actual count differs.

If actual serviced > configured:

- Create Operational Issue.
- Office can resolve as One-Day Exception or Update Permanent Drum Count.
- Permanent operational drum count changes future capacity calculations immediately.
- Financial pricing does not update automatically.
- Create Account Review Required flag.

### Capacity controls

Driver sees capacity meter, e.g. `32 / 40 drum units`.

System estimates load from drums collected since last dump.

When estimated capacity threshold is reached:

- Warn driver.
- Offer `Go to Dump` or `Continue Route`.

Driver may press `Near Capacity` earlier.

When `Near Capacity` / `Go to Dump` selected:

1. Find closest currently open approved dump.
2. Insert dump stop.
3. Re-optimise remaining client stops around dump.

Driver may manually adjust estimated load.

- Reason required.
- Adjustment retained for later vehicle capacity-learning recommendations.

At dump:

- Arrival/departure detected by geofence.
- Driver manually presses `Dump Complete`.
- Estimated vehicle load resets to zero.

### Route ending

After final stop, automatically enter Return to Depot state.

Driver can manually select Return to Depot early.

If early and unresolved stops remain:

- Reason required.
- Route flagged ending early/incomplete.

Depot entry records return time.

Driver then presses `End Route`.

End Route summary shows:

- Completed stops.
- Unresolved/problem stops.
- SKIPs.
- Drums serviced.
- Dump visits.
- Estimated remaining load.

Route may close with unresolved stops and is marked accordingly.

Store immutable closure facts:

- Closed time.
- Closure status.
- Team.
- Vehicle.
- Completed stop count.

Detailed report metrics are calculated on demand rather than permanently materialised at closure.

## 4.10 Dump Site Management

Owns:

- Approved dump sites.
- Coordinates/address.
- Opening hours.
- Active/temporarily unavailable status.
- Average configured dump duration.
- Historical learned duration recommendations.
- Geofence radius.
- Region/depot association where relevant.

Dump selection:

- Choose closest approved site that is open and available.
- If closest is closed/unavailable, choose next closest valid site.

Admins can add/edit/remove/disable dump sites without code changes.

## 4.11 Client Communications

One central Communications module serves all other modules.

No domain module integrates directly with WhatsApp, SMS or email providers.

Channels:

- WhatsApp primary.
- SMS fallback.
- Email fallback where configured.

The fallback order is configurable by message type.

### Client collection reminder

- Send at **07:30** on collection day.
- No previous-evening reminder.
- No customer ETA in initial version.
- Exact collection time not promised.

### Templates

- Editable standard templates.
- Variables.
- English and Afrikaans.
- Client preferred communication language.
- Language captured during onboarding when possible and editable later.
- Fall back to English if translated template unavailable.

### Communication importance

Template importance levels:

- Routine.
- Important.
- Critical.

Importance can influence:

- Retry aggressiveness.
- Fallback channels.
- Simultaneous multi-channel delivery for Critical messages.

### Delivery behaviour

- Centrally configurable retry policy.
- Fallback provider/channel when enabled.
- Alert office only after configured delivery paths fail.
- Short-term technical communication log: **30 days**.
- No permanent per-client archive of every automated message.

### Broadcasts

Support:

- Manual custom route/team broadcast.
- Emergency/global broadcast.
- Target by all active clients, region, territory, collection day or team where authorised.
- Preview recipient count + message before send.
- Emergency broadcasts limited to Director/Admin and Operations Manager.
- One-off scheduled broadcasts.
- Scheduled broadcast editable/cancellable before send.
- No recurring broadcast schedules initially.

## 4.12 SKIP Management

Workflow:

1. 07:30 reminder invites client to reply `SKIP` before 08:00.
2. Case-insensitive exact keyword logic accepts `skip`, `Skip`, `SKIP`, etc.
3. Duplicate SKIP replies combine into one request.
4. Request enters office approval queue.
5. Route is unchanged until approved.
6. On approval, stop removed and affected route re-optimised automatically.
7. Client receives approved confirmation.
8. Normal recurring assignment remains unchanged.

Cutoff:

- 08:00.
- SKIP after cutoff does not alter today's route.
- Client receives automatic cutoff-passed response.

Rejection:

- Office may reject valid pre-cutoff request.
- Rejection reason mandatory.
- Rejection reason is included in client response.

If stop was already cleaned before SKIP approval:

- Office may still approve for record purposes.
- Completed Cleaned outcome remains authoritative.
- Route is not retroactively changed.

No limit on number of SKIPs.

Store SKIP count/history on client profile.

No automatic frequent-SKIP alerts.

Office can manually mark Skip Today when request is received by phone/other means.

- Reason mandatory.
- One-day effect only.

## 4.13 Operational Issues

Owns issue lifecycle for field/service exceptions.

Issue workflow:

- New.
- In Progress (for Needs Attention workflow where assigned).
- Resolved.

Operational issue sources include:

- Drum unavailable.
- Could not access.
- Drum missing.
- Unexpected account hold.
- Other issue.
- Extra drum discrepancy.
- Vehicle Problem.
- Emergency Contact.
- Unresolved end-of-day route stops where needed.

Resolution note optional unless a specific workflow says otherwise.

Issue evidence may include photo, GPS, stop, route, vehicle and timestamp.

Resolved basic operational items do not require a standalone searchable archive, but underlying permanent service/client history remains intact where applicable.

## 4.14 Needs Attention

Central actionable work queue aggregating underlying records without duplicating them.

Sources:

- Operational Issues.
- Account Review Required.
- Sync Conflicts.
- Communication Failures.
- Overloaded routes.
- Critical unacknowledged events.
- Dead-letter events.
- Selected System Health failures.

Features:

- Role-aware visibility.
- Priority/severity.
- Assign to specific office/team member.
- New -> In Progress -> Resolved.
- Link to source record.
- Resolver and timestamp.
- Auto-resolution for conditions that genuinely clear.
- Auto-resolved marker and condition/time.
- SLA/age thresholds configurable by issue type and severity.
- Escalation can trigger internal notification.

## 4.15 Account Review Required

Used when an operational change may require a financial/accounting correction.

Example: actual/client drum count permanently increased.

Behaviour:

- Does not automatically change financial pricing.
- Appears in dedicated queue.
- Remains until resolved.
- Resolution note optional.
- Resolved item remains in permanent client account/service history.

## 4.16 Accounting Integration

Future integration, but architecture provision is required now.

Ownership:

- Accounting system authoritative for payment, balance and financial status.
- Control Centre authoritative for operational route eligibility/status.

Desired mapping:

```text
Accounting financial state
        -> integration rules
        -> Control Centre operational status
             Active / On Hold / Cancelled
        -> routing consequence
```

If accounting integration is unavailable:

- Continue using last successfully synchronised state.
- Mark financial data/integration state stale.
- Do not stop core field operations.

## 4.17 Alerts & Activity Feed

Activity Feed contains meaningful operational events, not every routine stop completion.

Examples:

- Route start/completion.
- New issue.
- Approved SKIP.
- Capacity warning.
- Dump visit.
- Sync conflict.
- Communication failure.
- Route re-optimisation.

Severity:

- Info.
- Warning.
- Critical.

Critical items remain highlighted until acknowledged.

Acknowledging a Critical event does not resolve its underlying issue.

Record acknowledger and timestamp.

## 4.18 Vehicle/Route Alerting

Configurable alert types include:

- Tracking offline.
- Low tracking-device battery.
- After-hours movement.
- Vehicle stopped unusually long.
- Vehicle stopped unusually long at a client.
- Route deviation.
- Team falling behind schedule.
- Route started late.
- Route completed unusually early.
- Vehicle entered unexpected area.
- Overloaded route.
- Vehicle unavailable while assigned work.
- System-wide GPS outage.

Each alert type can configure:

- Threshold.
- Grace period where relevant.
- Recipient email addresses.
- Severity.
- Enabled/disabled.

Working hours configurable per vehicle/team.

After-hours exceptions can be explicitly authorised by Operations Manager.

- Reason required.
- Approver recorded.

Route-deviation detection requires both configurable distance and configurable duration before alerting.

Late start should be derived from the vehicle leaving its depot geofence rather than requiring a Start Route button.

## 4.19 Timing & Historical Learning

Do not base operational timing primarily on Google live traffic.

Initial configurable timing assumptions:

- Average minutes per kilometre.
- Average service minutes by drum count.
- Dump duration.

Historical learning should later recommend better values using actual MegaBin operational data.

Recommendations should:

- Be calculated separately per team where useful.
- Learn service time by number of drums.
- Exclude abnormal/problem outcomes from normal service-time learning.
- Learn dump-site duration from geofence history.
- Require administrator approval before replacing configured defaults.

Vehicle-capacity learning:

- Use historical dump behaviour.
- Use driver manual load adjustments.
- Recommend capacity settings.
- Configured capacity remains authoritative until approved.

## 4.20 Reporting

Build a reusable reporting framework, not module-specific reports.

Core operational filters:

- Date range.
- Team.
- Vehicle.
- Driver.
- Region.
- Service area/territory.
- Collection outcome.

Reports may compare:

- Team vs team.
- Period vs period.
- Planned vs actual operational metrics.
- Configured vs actual drum count.
- Route performance.
- Distance.
- Stops/hour.
- Collections/hour.
- Dump visits.
- Missed/problem outcomes.

Detailed route metrics can be calculated on demand from retained route/service data.

Export:

- CSV.
- Excel.
- Role permissions apply to exports.
- Export audit records who, when, report/filter and format.
- Large exports generated as background jobs.
- In-app notification when ready.
- Export files deleted after 24 hours by default.
- Retention configurable.

Saved reports:

- Private by default.
- Can be shared.
- Viewer permissions still apply.

## 4.21 Global Search

Office global search covers:

- Clients.
- Addresses.
- Vehicles.
- Teams.
- Routes.
- Issues.
- SKIPs.
- Users.

Client search supports:

- Address.
- Suburb.
- Mobile.
- Email.
- Signup reference.
- Client name.

Support partial/fuzzy matching.

Group results by type.

Do not add radius/proximity search initially.

## 4.22 Map & Operations Control Room

Primary office map shows all active vehicles simultaneously with team identifiers.

Vehicle marker statuses:

- On Route.
- At Client.
- At Dump.
- Stationary.
- Off Route.
- Tracking Offline.
- Off Duty.

Click vehicle:

- Team.
- Driver.
- Vehicle.
- Current location.
- Current stop.
- Next stop.
- Route progress.
- Completed/skipped/remaining stops.
- Estimated completion time.
- Capacity meter.
- Last GPS update.
- Planned remaining route line/stops.

Actions:

- Call Driver.
- View Route.
- Reassign Stops.
- Pause/mark route operationally affected where applicable.
- Add Operational Note.
- Recalculate Route.

Map layers:

- Vehicles.
- Clients/stops.
- Active routes.
- Territories.
- Depots.
- Dump sites.

Filters:

- Region.
- Depot.
- Team/vehicle.
- Route status.

Client map popup:

- Address.
- Team/day.
- Drum count.
- Current service state.
- Access information.
- Latest relevant operational issue.

Historical playback:

- Select date + team/vehicle.
- Within six-month GPS window: detailed movement trail.
- After GPS expires: route/service plan and stop history remain viewable without detailed raw trail.

Control Room dashboard includes:

- Live map.
- Active teams.
- Scheduled collections.
- Completion percentage.
- Client SKIPs.
- Delayed/at-risk teams.
- Operational issues.
- Alerts.
- Needs Attention.

Designed to remain open on an office display/TV.

## 4.23 System Health & Diagnostics

Owns technical state, not business truth.

System Health shows:

- GPS tracking health.
- Google Maps integration.
- WhatsApp.
- SMS.
- Email.
- Website onboarding.
- Spreadsheet transition sync.
- Accounting integration.
- Database backup state.
- Scheduled jobs.
- 07:00 route generation.
- Event/outbox health.
- Dead-letter queue.

Every integration stores:

- Current health.
- Last successful sync/action.
- Last failure.
- Staleness.

Critical failures trigger configurable administrator email alerts.

Critical-system recipient lists are separate from operational vehicle alert recipients.

### Technical logs

Maintain separate classes:

1. Permanent business audit log.
2. Integration event log — default 90 days.
3. API request/error log — default 30 days.
4. Communications technical log — 30 days.
5. Raw GPS telemetry — 6 months.

Use correlation IDs across API, background jobs, integration actions and user-visible failures.

Expose safe user-facing reference IDs, e.g. `MB-...`, without exposing technical logs.

Diagnostic bundle:

- Authorised admin can generate.
- Includes safe system status and correlation references.
- Excludes secrets, passwords, API keys and financial data.
- Automatically redacted where required.

## 4.24 Integration Registry

Central registry for every external integration.

Lifecycle:

```text
Install/Enable
-> Configure
-> Test
-> Monitor
-> Disable
-> Decommission
```

Fields include:

- Provider.
- Purpose.
- Owner module.
- Connection state.
- Last successful interaction.
- Last failure.
- Sandbox/test mode.
- Health check.
- Allowed inbound fields.
- Allowed outbound events.
- Retry configuration.
- Decommissioning dependencies.

Credentials/secrets must remain in secure environment secret management, not ordinary business tables or frontend code.

## 4.25 Feature & Integration Sandbox

Developer/admin-only tool for staging/test environments.

Supports:

- Test webhook payloads.
- Integration testing.
- Notification template testing.
- Feature-flag testing.
- Captured event replay.

Captured events can preserve original payloads as explicitly decided; therefore access must be highly restricted.

Replay controls restricted to Director/Admin and explicitly authorised developer users.

Test event library stores:

- Event ID.
- Type.
- Source.
- Capture date.
- Replay status.
- Who replayed.

Replay must be idempotent by default.

## 4.26 Configuration & Feature Flags

Central configuration registry for:

- Capacities.
- Geofence radii.
- Route assumptions.
- Alert thresholds.
- Retry policies.
- Working hours.
- Notification settings.
- Export retention.
- Integration settings.
- Feature flags.

Feature flags support:

- Environment.
- Role.
- Region.
- Specific users/teams for controlled rollout.

Configuration changes should be versioned/audited where appropriate.

Environment configuration is isolated between development/staging/production.

---

# 5. Critical State Machines

## 5.1 Client

```text
Pending
  -> Active
  -> On Hold
  -> Active
  -> Cancelled
  -> Archived
```

Rules are enforced in backend/domain logic, not only UI.

## 5.2 Route

```text
Draft/Generated
  -> Published
  -> Active
  -> Returning to Depot
  -> Closed
  -> Closed with Unresolved Stops
```

Fallback/failed generation is represented separately as system state rather than a normal route lifecycle state.

## 5.3 Route Stop

```text
Scheduled
  -> Arrived/In Progress
  -> Cleaned
  -> Skipped
  -> Drum Empty
  -> Drum Unavailable
  -> Could Not Access
  -> Drum Missing
  -> Account Hold
  -> Other Issue
```

## 5.4 SKIP Request

```text
Requested
  -> Approved
  -> Rejected
```

Late requests may be recorded as Late/Not Applied without changing route state.

## 5.5 Operational Issue / Needs Attention Item

```text
New
  -> In Progress
  -> Resolved
```

Some technical items may auto-resolve.

## 5.6 Integration

```text
Configured
  -> Testing
  -> Active
  -> Degraded
  -> Disabled
  -> Decommissioned
```

## 5.7 Vehicle

```text
Available
  -> In Service
  -> Maintenance
  -> Unavailable
  -> Available
  -> Retired
```

---

# 6. Data Ownership Matrix

| Domain/Data | Authority | Allowed inbound source | Notes |
|---|---|---|---|
| Initial website signup | Website until activation | Website webhook | Control Centre creates Pending Client |
| Activated client operations | Control Centre | Controlled office/API changes | Website no longer authoritative |
| Service address | Control Centre after activation | Office / approved import rules | Re-geocode on change |
| Territory/team/day | Control Centre | Suggestion engine + office | Operational truth |
| Drum count | Control Centre | Driver discrepancy + office resolution | Financial review may be generated |
| Payment/balance | Accounting system | Accounting integration | Financial truth |
| Operational account state | Control Centre | Derived from accounting rules / office | Determines route eligibility |
| Raw GPS | Tracking device/provider | GPS ingestion adapter | Six-month retention |
| Current vehicle location | Control Centre tracking module | Derived from latest GPS | Realtime dashboard record |
| Route plan | Route module | Internal optimiser/office override | Versioned |
| Collection outcome | Route Operations module | Driver PWA / office correction | Permanent service history |
| Google geocoding/distance | Google | Mapping adapter | External calculation only |
| Communication delivery | Provider | Communication adapter | Technical log only 30 days |
| Message rules/templates | Control Centre | Authorised office settings | English/Afrikaans |
| Spreadsheet transition | Spreadsheet for explicitly allowed temporary fields only | Scheduled import adapter | Never overwrites Control Centre-owned fields silently |

---

# 7. Security Model

## 7.1 Supabase Auth + RLS

Use Supabase Auth for user identity.

Use Row Level Security as a core data-access layer.

Authorization data should be based on server-controlled application metadata/tables, not user-editable profile metadata.

RLS must align with:

- Role.
- Granular permission.
- Service region where applicable.
- Team/vehicle assignment for driver users.

## 7.2 Driver device trust

Each Driver/Team device:

- Registered.
- Approved by office before first access.
- Associated with team/vehicle/device identity.
- Normally limited to one active device per account unless explicitly approved.
- Remotely revocable.
- Persistent session allowed on authorised device.
- New device requires secure authentication/approval.

## 7.3 Driver data minimisation

Expose only operational data necessary for service.

Cache only required route-day data.

Clear cached route/client data after a recommended short retention period following completion; recommended initial target: **24 hours after route closure**, configurable.

## 7.4 High-risk actions

Require recent re-authentication for:

- Restore backup.
- Roll back import.
- Decommission integration.
- Access sensitive integration configuration.
- Change production security configuration.
- Other designated high-risk actions.

---

# 8. Offline Architecture

Driver PWA must remain useful with intermittent connectivity.

Before route:

- Cache today's route.
- Cache required access information.
- Cache configuration needed for field actions.

Offline actions:

- Stop outcomes.
- Actual drum counts.
- Photos/evidence queued locally.
- Load adjustments.
- Dump actions where possible.
- GPS points buffered by tracking component.

Each offline event:

- Unique event ID.
- Device ID.
- Local timestamp.
- Sequence/order metadata.
- Idempotency key.

On reconnect:

- Replay in order where business rules require ordering.
- Never duplicate previously processed events.
- Detect conflicts.
- Do not silently overwrite server-side newer state.
- Preserve conflicting evidence/events.
- Send conflict to Sync Conflicts queue.

Example conflict:

- Office approves SKIP while driver is offline.
- Driver cleans stop while offline.
- On sync, Cleaned remains actual service outcome.
- SKIP event remains recorded.
- Conflict goes to office review.

---

# 9. Backup, Recovery & Retention

## 9.1 Recommended production recovery policy

Because the Control Centre will become operationally critical, database recovery should be stronger than a simple once-daily manual mindset.

Recommended approach:

- Use Supabase production backup capability appropriate to the selected plan.
- Evaluate Point-in-Time Recovery for production once live operational dependency becomes high enough to justify cost.
- Maintain daily independent logical/off-site backup where practical for defence in depth and migration portability.
- Database restore procedure must be documented and tested.
- Supabase Storage objects require a separate backup/export strategy because database backups do not automatically cover Storage files.

Recommended targets once the platform is production-critical:

- **RPO target:** <= 1 hour for core operational database where economically practical; otherwise explicitly accept the active platform backup limitation.
- **RTO target:** <= 4 hours for a serious operational outage during business hours.
- Restore drill: at least quarterly in staging from a production-safe backup/export.
- High-risk migration: verify recent recoverable backup before applying.

The originally requested daily backup + 30-day retention remains the baseline business expectation, but implementation must be reconciled with the actual Supabase plan's supported backup/PITR options.

## 9.2 Data retention matrix

| Data category | Retention | Action |
|---|---:|---|
| Client master data | Life of client + archive | Soft delete/archive |
| Permanent business audit log | Indefinite | Never routine-delete |
| Client service history | Indefinite | Retain |
| SKIP history | Indefinite as client service history | Retain |
| Account Review history | Indefinite | Retain |
| Raw GPS points | 6 months | Auto-delete |
| Route-plan versions | 6 months | Auto-delete old versions |
| Route/service history | Indefinite | Retain independently of GPS |
| Operational evidence photos | Recommend 24 months initially, configurable | Review once dispute patterns known |
| Communication technical logs | 30 days | Auto-delete |
| API/error logs | 30 days | Auto-delete |
| Integration event logs | 90 days | Auto-delete |
| Export files | 24 hours default | Auto-delete |
| Export audit records | Recommend 24 months | Retain metadata, not exported file |
| Diagnostic bundles | Recommend 7 days | Auto-delete unless explicitly preserved |
| Import batch records | Retain while integration/import history is active; spreadsheet history deleted on formal decommission per decision | Controlled |
| Database backups | 30 days business target where plan/implementation supports it | Automated rotation |
| Driver device cached route data | Recommend 24 hours after route closure | Auto-clear |
| Dead-letter technical events | Recommend 90 days after resolution | Auto-delete |

Retention settings that are operational rather than legal requirements should be configurable.

---

# 10. Supabase-Specific Implementation Guardrails

1. Use version-controlled migrations for all schema changes.
2. Keep development, staging and production projects/databases/credentials isolated.
3. Enable and test RLS on exposed operational tables.
4. Do not expose privileged service credentials to browsers/PWAs.
5. Keep secrets in secure secret/environment management.
6. Treat Storage authorization separately from database-row authorization.
7. Use Realtime selectively for current operational state, not every raw GPS insert.
8. Use Edge Functions for controlled integration boundaries/webhooks where appropriate.
9. Use scheduled backend jobs for route generation, notification dispatch, retention cleanup and health checks.
10. Keep raw telemetry ingestion isolated from normal client/route transaction latency.
11. Run security/advisor checks during schema changes.
12. Pin dependencies and commit lockfiles.

---

# 11. Development Priority Model

Every capability is classified into one of three groups.

## A. Build Now

Needed to create the operational foundation and first useful system.

## B. Architect Provision Now / Build Later

Do not implement full UI/workflow yet, but database/domain/API boundaries must not block it later.

## C. Future Optional

Useful future capability that should not complicate initial architecture unnecessarily.

---

# 12. Prioritised Development Roadmap

## Phase 0 — Architecture & Repository Foundation
### Priority: BUILD NOW

**Goal:** Establish the rules Codex must not violate later.

Deliverables:

- Monorepo.
- Office app shell.
- Driver PWA shell.
- Shared packages.
- Supabase development project setup.
- Staging/production environment pattern documented.
- Migration workflow.
- Supabase Auth foundation.
- Base RLS patterns.
- Permission framework.
- API versioning skeleton.
- OpenAPI generation approach.
- Domain event/outbox foundation.
- Idempotency conventions.
- Correlation ID convention.
- Central config framework.
- Feature-flag framework.
- Architecture docs.
- ADR log.
- Module dependency map.
- Automated lint/import-boundary enforcement.
- Test framework.
- CI checks.

**Definition of Done:**

- Repository builds.
- Frontends authenticate against development environment.
- Test suite runs.
- Migration workflow proven.
- RLS proof-of-concept verified.
- Event/outbox proof-of-concept verified.
- API docs generated.
- Architecture and ADR baseline committed.

Do not build real operational features before this phase is stable.

---

## Phase 1 — Master Data Foundation
### Priority: BUILD NOW

**Goal:** Create the operational source of truth.

Build:

- Service regions.
- Depots.
- Territories + polygons.
- Teams.
- Drivers/basic staff directory.
- Vehicles.
- Approved dump sites.
- Clients.
- Client operational statuses.
- Client notes.
- Drum count.
- Service assignment.
- Search/filter foundation.
- Audit log.
- Soft-delete/archive model.
- Configuration registry.

Provision now for:

- Accounting source references.
- Fuel records.
- Maintenance/compliance.
- Multi-region scale.

Testing:

- Entity lifecycle tests.
- Permission/RLS tests.
- Territory-assignment tests.
- Audit tests.

---

## Phase 2 — Website Onboarding + Legacy Data Migration
### Priority: BUILD NOW

**Goal:** Feed real clients into the master database safely.

Build:

- Website inbound webhook/API.
- Pending Client queue.
- Address parsing.
- Geocoding adapter.
- Suggested region/depot/territory/team/day.
- Office activation workflow.
- CSV/Excel import.
- Preview/validation.
- Duplicate detection/review.
- Import batch records.
- Import rollback.
- Spreadsheet recurring inbound sync.
- Field ownership configuration.
- Sync-conflict integration.
- Integration Registry foundation.

Do not yet depend on route optimisation for activation success.

---

## Phase 3 — Daily Roster + Route Planning MVP
### Priority: BUILD NOW

**Goal:** Generate usable daily routes before GPS or client notifications are required.

Build:

- Permanent team/vehicle assignment.
- Daily operational roster.
- Temporary substitutions.
- Staff/vehicle availability.
- Roster locking.
- 07:00 scheduled generation.
- Basic eligibility filtering.
- Capacity calculation.
- Territory constraints.
- Depot start/end.
- Dump-site awareness.
- Distance-first optimiser.
- Route versioning.
- Automatic publish.
- Overload warning.
- Suggested transfer to nearby eligible team.
- Manual route planning screen.
- Drag/move stop between teams.
- Mandatory override reasons.
- Re-optimise route.
- Google Maps navigation links.

This is the first phase that should deliver clear operational value.

---

## Phase 4 — Driver/Team PWA
### Priority: BUILD NOW

**Goal:** Replace paper/static route execution with a field workflow.

Build:

- Registered device model.
- Persistent authorised session.
- Route list + map.
- Access information.
- Stop status/outcome.
- Photos where required.
- Actual drum count.
- Google Maps navigation button.
- Capacity meter.
- Near Capacity action.
- Dump workflow.
- Return to Depot.
- End Route.
- Offline cache.
- Offline action queue.
- Idempotent sync.
- Sync conflict detection.
- Emergency Contact.
- Vehicle Problem.

Provision now for dedicated background tracking companion.

---

## Phase 5 — GPS Tracking & Live Operations
### Priority: BUILD NOW

**Goal:** Deliver constant vehicle visibility and exception detection.

Build:

- Tracking-device registration.
- Dedicated GPS ingestion API.
- Raw location-history table.
- Current vehicle state table.
- Offline telemetry buffering contract.
- Device battery/last update.
- Control Room live map.
- Geofence engine.
- Client arrival detection.
- Depot departure/return detection.
- Dump arrival/departure detection.
- Route deviation.
- Tracking-offline alerts.
- After-hours movement.
- Long stop.
- Team-behind-schedule using MegaBin timing model.
- Late start.
- Current route progress.
- 6-month GPS cleanup.
- Historical route playback.

If PWA background tracking proves unreliable, deploy dedicated lightweight tracking app while retaining PWA field UI.

---

## Phase 6 — Client Communications & SKIP
### Priority: BUILD NOW

**Goal:** Automate collection reminders and allow client-driven route changes.

Build:

- Communications module.
- Provider adapter interface.
- WhatsApp integration.
- SMS fallback integration.
- Email fallback integration.
- Templates.
- English/Afrikaans.
- Preferred language.
- Importance levels.
- Retry/fallback configuration.
- 07:30 collection reminder job.
- Inbound WhatsApp SKIP.
- 08:00 cutoff.
- Office approval/rejection queue.
- Automatic re-optimisation after approval.
- Client confirmation/rejection messages.
- Late SKIP response.
- Manual office Skip Today.
- Technical delivery logs.
- Communication Failure issues.
- Route/team broadcasts.
- Emergency broadcasts.
- One-off scheduled broadcasts.

---

## Phase 7 — Operations Command Layer
### Priority: BUILD NOW AFTER PHASES 3–6

**Goal:** Make the office dashboard genuinely actionable rather than just informational.

Build:

- Activity Feed.
- Needs Attention.
- Assignment.
- SLA escalation.
- In-app notifications.
- Critical acknowledgement.
- Alert configuration.
- Route action panel.
- Call Driver.
- Global search.
- Advanced map filtering.
- Route-change indicators.
- System Health dashboard.

---

## Phase 8 — Reporting & Historical Analytics
### Priority: BUILD LATER, PROVISION NOW

Build:

- Reusable report engine.
- Saved views.
- Period/team comparisons.
- CSV/Excel export.
- Background export jobs.
- Export audit.
- 24h generated-file cleanup.
- Historical timing recommendations.
- Service-time learning by drum count.
- Dump-duration recommendations.
- Vehicle capacity recommendations.

The data needed for this phase must be captured correctly from Phases 1–7.

---

## Phase 9 — Accounting Integration
### Priority: BUILD LATER, PROVISION NOW

Build:

- Accounting provider adapter.
- Financial-state sync.
- Operational status derivation.
- Stale-state fallback.
- Account Review workflow enhancements.
- Future overdue/collection-hold automation.

Financial pricing remains accounting-owned.

---

## Phase 10 — Fleet Management Enhancements
### Priority: BUILD LATER

Build:

- Maintenance schedule UI.
- Odometer records.
- GPS-derived km comparison.
- Discrepancy alerts.
- Vehicle compliance view.
- Expiry notifications.

Future optional:

- Fuel entries.
- Fuel provider integration.
- Fuel-consumption analytics.

---

## Phase 11 — Advanced Platform Operations
### Priority: BUILD LATER / TECHNICAL

Build or harden:

- Feature & Integration Sandbox.
- Event replay tooling.
- Dead-letter admin tooling.
- Diagnostic bundle.
- Integration decommissioning workflow.
- Advanced observability.
- Backup/restore drill tooling/documentation.

---

# 13. Build-Now vs Provision-Now Matrix

| Capability | Classification |
|---|---|
| Master client database | Build Now |
| Regions/depots/territories | Build Now |
| Teams/vehicles/daily roster | Build Now |
| Route optimisation | Build Now |
| Driver PWA | Build Now |
| GPS/live control room | Build Now |
| Client reminder + SKIP | Build Now |
| Needs Attention | Build Now after core ops |
| System Health | Build Now after integrations begin |
| Reporting framework contracts | Provision Now |
| Full reporting UI | Build Later |
| Accounting interface contracts | Provision Now |
| Full accounting sync | Build Later |
| Vehicle maintenance schema hooks | Provision Now |
| Maintenance UI | Build Later |
| Fuel | Future Optional / Provision light hooks |
| Multi-city/region | Provision Now structurally |
| Native mobile app | Future Optional |
| Custom turn-by-turn navigation | Future Optional |
| Customer ETA messaging | Future Optional |
| AI/natural-language SKIP interpretation | Future Optional |
| Advanced machine-learning optimisation | Future Optional |

---

# 14. Data Model: Core Entity Inventory

This is the logical domain inventory. Exact SQL schema should be produced during Phase 0/1 and documented separately.

## Identity

- user
- role
- permission
- role_permission
- user_role
- registered_device
- user_notification_preference

## Geography

- service_region
- depot
- territory
- territory_polygon
- territory_priority
- approved_dump_site

## People/Operations

- staff_member
- team
- team_member_assignment
- daily_roster
- daily_roster_assignment
- staff_absence

## Vehicles

- vehicle
- vehicle_assignment
- vehicle_availability
- vehicle_working_hours
- vehicle_capacity_config
- vehicle_maintenance_window
- vehicle_odometer_entry
- vehicle_compliance_item
- tracking_device

## Clients

- client
- client_service
- service_address
- client_assignment
- client_territory_override
- client_operational_note
- client_account_status
- client_drum_configuration
- account_review_item

## Onboarding/Imports

- signup_submission
- import_batch
- import_record
- duplicate_candidate
- spreadsheet_sync_batch

## Routing

- route
- route_version
- route_stop
- route_stop_outcome
- route_override
- route_dump_visit
- route_capacity_event

## GPS

- vehicle_location_history
- vehicle_current_state
- geofence_event

## Client requests

- skip_request

## Operations

- operational_issue
- needs_attention_assignment
- activity_event
- alert
- alert_rule

## Communications

- communication_template
- communication_template_translation
- communication_policy
- outbound_message_attempt
- inbound_message_event
- broadcast

## Integrations

- integration
- integration_health
- integration_field_permission
- integration_sync_state
- sync_conflict
- integration_event_log

## Platform

- domain_event_outbox
- dead_letter_event
- feature_flag
- configuration_value
- audit_log
- api_error_log
- export_job
- saved_report
- diagnostic_bundle

---

# 15. Route Optimisation Functional Contract

Codex must treat the optimiser as a replaceable domain service.

Input contract includes:

- Date.
- Region/depot.
- Eligible clients.
- Client coordinates.
- Drum units.
- Fixed collection day.
- Territory.
- Eligible teams.
- Team/vehicle capacity.
- Vehicle availability.
- Daily roster.
- Depot coordinates.
- Dump-site coordinates/open state.
- Existing completed stops/current position for active re-optimisation.
- Manual overrides.

Output:

- Route per team.
- Ordered stops.
- Planned distance.
- Expected capacity profile.
- Suggested dump points if deterministically needed.
- Overload warnings.
- Suggested transfers.
- Constraint violations.

Optimiser implementation may evolve later without changing upstream/downstream contracts.

---

# 16. Geospatial Contract

Use geographic coordinates as first-class data.

Addresses are human-readable labels; routing/geofencing uses lat/lng.

Geospatial needs include:

- Geocoding.
- Territory containment.
- Territory overlap.
- Distance calculations.
- Client geofence.
- Depot geofence.
- Dump geofence.
- Route-deviation distance.
- Vehicle-to-route relationship.

Google Maps may be used for geocoding/navigation/distance services, but core MegaBin geographic entities remain in the master database.

---

# 17. Testing Strategy

Every phase must maintain tests alongside implementation.

## Unit tests

Cover:

- State transitions.
- Eligibility rules.
- Capacity.
- SKIP cutoff.
- Alert thresholds.
- Permission rules.
- Data ownership rules.
- Idempotency.

## Integration tests

Cover:

- Supabase/RLS.
- Module boundaries.
- Website webhook.
- Spreadsheet sync.
- Mapping adapter.
- Communication adapters.
- Event outbox.
- Offline-sync replay.

## End-to-end tests

Critical flows:

1. Website signup -> activation -> route eligibility.
2. 07:00 route generation -> driver route.
3. Stop arrival -> Cleaned.
4. Non-cleaned stop -> evidence -> Operational Issue.
5. SKIP -> approval -> route re-optimisation.
6. Near Capacity -> dump -> reset.
7. Offline stop -> reconnect -> successful idempotent sync.
8. Conflict -> Sync Conflicts.
9. Tracking offline -> alert.
10. Route close with unresolved stops.

## Security tests

- RLS matrix.
- Role permissions.
- Driver data minimisation.
- Cross-region access.
- Device revocation.
- Privileged action re-authentication.
- External integration field restrictions.

---

# 18. Definition of Done for Every Phase

A phase is not complete until:

1. Acceptance criteria are implemented.
2. Unit tests pass.
3. Integration tests pass.
4. Relevant end-to-end tests pass.
5. RLS/security rules are verified.
6. Database migrations apply cleanly from previous production-like schema.
7. Rollback plan exists.
8. API contracts/docs are updated.
9. Domain events/contracts are updated.
10. ADRs are updated for material architecture decisions.
11. Module dependency rules pass.
12. Feature flags/rollout controls exist where needed.
13. Manual staging test is completed.
14. No unresolved critical security/advisor findings remain.
15. Backup/recovery prerequisite is verified for high-risk production migrations.

---

# 19. Codex Working Rules

Codex should be instructed to follow these rules throughout development.

## Rule 1 — Do not build ahead blindly

Work one roadmap phase/sub-phase at a time.

Before implementation:

- Read architecture docs.
- Read relevant ADRs.
- Inspect existing code/migrations.
- Confirm module ownership.
- Identify dependencies.

## Rule 2 — Protect the master data model

Never create a second representation of an authoritative entity simply because it is convenient for a new module.

Reuse IDs and relationships.

## Rule 3 — Do not couple integrations to business logic

Core business workflows call the adapter/service interface, not provider-specific SDK code directly.

## Rule 4 — Database changes require migrations

No untracked production schema edits.

## Rule 5 — Backend enforces rules

Do not rely on frontend hiding/buttons for:

- Permissions.
- State transitions.
- Data ownership.
- SKIP cutoff.
- Route eligibility.
- High-risk operations.

## Rule 6 — Idempotency first

All webhooks, offline events, retries and replays must be safe to process more than once.

## Rule 7 — Realtime is not the database architecture

Realtime is a delivery mechanism for live state, not the primary source of truth.

## Rule 8 — Capture future-needed data early

Even when reporting/learning is later, capture the source facts now:

- Stop arrival/completion timestamps.
- Actual drum count.
- Team/vehicle.
- Route version.
- Dump visits.
- Capacity adjustments.
- Operational outcome.

## Rule 9 — Feature flag unfinished capability

Do not expose partially built modules to production users.

## Rule 10 — Document architectural changes

Material deviations require an ADR update.

---

# 20. Recommended First Codex Implementation Sequence

The first Codex instruction should **not** ask Codex to build the whole system.

The first implementation ticket should be approximately:

### Milestone A — Architecture Bootstrap

1. Inspect current MegaBin Control Centre repository.
2. Establish/confirm monorepo structure.
3. Establish Supabase local/dev configuration.
4. Add migrations directory/process.
5. Add Auth scaffolding.
6. Add role/permission model.
7. Add baseline RLS strategy/tests.
8. Add module boundaries.
9. Add shared domain types/validation.
10. Add API v1 skeleton + OpenAPI generation.
11. Add outbox/event abstractions.
12. Add correlation ID/error handling.
13. Add feature/config registry skeleton.
14. Add test infrastructure.
15. Add architecture docs/ADR templates.
16. Verify everything before adding business entities.

Then Milestone B introduces geography/master entities; Milestone C introduces clients/onboarding; only then routes.

---

# 21. Recommended Architecture Decisions to Record Immediately

Create ADRs for at least:

1. **ADR-001:** Supabase as platform foundation.
2. **ADR-002:** Modular monolith over microservices.
3. **ADR-003:** PostgreSQL master operational source of truth.
4. **ADR-004:** API-first external and frontend contracts.
5. **ADR-005:** Module/entity ownership and controlled writes.
6. **ADR-006:** Domain events + durable outbox.
7. **ADR-007:** Separate office web and Driver PWA frontends.
8. **ADR-008:** PostGIS/geospatial first-class modelling.
9. **ADR-009:** Raw GPS history vs current vehicle state separation.
10. **ADR-010:** External integrations behind adapters.
11. **ADR-011:** Offline event queue + idempotency/conflict model.
12. **ADR-012:** Supabase Auth + RLS + granular permissions.
13. **ADR-013:** Route optimiser as replaceable domain service.
14. **ADR-014:** Data retention policy.
15. **ADR-015:** Environment isolation and deployment policy.

---

# 22. Current Operational Defaults

These should be stored as configuration, not hard-coded business logic.

| Setting | Initial value |
|---|---|
| Normal working hours | 07:30–16:30 |
| Typical route departure | 07:30–08:00 |
| Daily route generation | 07:00 |
| Client collection reminder | 07:30 |
| SKIP cutoff | 08:00 |
| GPS update target | 30–60 sec |
| Raw GPS retention | 6 months |
| Route version retention | 6 months |
| Communications technical log | 30 days |
| Integration technical log | 90 days |
| API/error log | 30 days |
| Export file retention | 24 hours |
| Database backup business target | Daily, 30-day retention subject to Supabase implementation/plan |
| Route optimisation objective | Lowest total distance |
| Drum capacity unit | 1 per drum |
| Customer ETA messages | Disabled initially |
| Client reminder previous evening | Disabled |
| Driver manual route reordering | Disabled |
| Driver Cleaned photo requirement | None |
| Non-Cleaned photo requirement | Required |

---

# 23. Explicitly Deferred Capabilities

Do not let these expand early phases:

- Native Android/iOS driver application unless background tracking forces a small tracking companion.
- Proprietary turn-by-turn navigation.
- Customer ETA messaging.
- Natural-language interpretation of WhatsApp SKIP messages.
- Automated client rescheduling after missed service.
- Full fuel management.
- Full staff HR/compliance.
- Advanced fleet incident management.
- AI-based route optimisation beyond data-driven recommendations.
- Microservices.

---

# 24. Key Product Principle

Every new module should answer five questions before implementation:

1. **Which master entities does it read?**
2. **Which entities does it own?**
3. **Which state changes may it make?**
4. **Which domain events does it emit/consume?**
5. **What happens if the module or external provider is unavailable?**

If those five answers are unclear, the module is not ready to implement.

---

# 25. Source & Platform Notes

Supabase-specific implementation details should always be checked against the current official Supabase documentation and changelog before Codex implements them, because platform capabilities and configuration conventions can change.

Useful official references:

- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/functions
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/realtime
- https://supabase.com/docs/guides/storage
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/changelog

---

# 26. Final Direction

The Control Centre should be built as **MegaBin's operational platform**, with route optimisation, field operations, tracking and communications forming the first operational vertical slice.

The immediate build order is:

```text
Architecture foundation
    ↓
Master data
    ↓
Onboarding/import
    ↓
Daily roster + routing
    ↓
Driver PWA
    ↓
GPS/live operations
    ↓
Client communications + SKIP
    ↓
Operations command layer
    ↓
Reporting / Accounting / Fleet extensions
```

The first success criterion is not “all features work.”

The first success criterion is:

> **The foundation is structurally correct enough that every later module can plug into the same source of truth without forcing a rewrite of the core platform.**

