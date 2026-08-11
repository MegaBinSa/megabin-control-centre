# Data Ownership Matrix

**Status:** Approved initial ownership rules

## Rules

- PostgreSQL in the Control Centre is the master operational source of truth after client activation.
- An external system may submit data only through its approved adapter and field scope.
- External systems never access the master database directly.
- Cross-module changes use the owning module's application/domain layer.
- Imported or provider-supplied data keeps source, external reference, receipt time, and processing status.

## Ownership

| Data | Authority | Inbound source | Derived or provider metadata | Write rule |
|---|---|---|---|---|
| Public signup before activation | MegaBin website | Website local-save-first forwarding | Submission delivery/attempt metadata | Website retains intake authority; Control Centre records a pending submission idempotently |
| Activated client operational master data | Control Centre | Approved office action or controlled import | External references and import provenance | Clients module only |
| Client contacts | Control Centre after activation | Website submission, office change | Validation/delivery metadata | Clients module only |
| Service address and coordinates | Control Centre after activation | Website/office address; mapping result | Geocode provider result/confidence | Service Addresses module approves authoritative result |
| Service configuration, territory, day, team, drum count | Control Centre | Office, driver discrepancy workflow, suggestion engines | Suggestions and review flags | Owning operational module only |
| Spreadsheet transition data | Spreadsheet only for explicitly declared temporary fields | Scheduled adapter | Batch, row, conflict, and retry metadata | Never silently overwrites Control Centre-owned fields |
| Payment, balance, and financial status | Accounting integration/provider | Accounting adapter | Sync time, provider status, stale-state flags | Financial provider remains authoritative; Control Centre derives operational consequences |
| Operational account/service eligibility | Control Centre | Accounting facts and authorized office decisions | Derivation reason and audit | Clients/Service Configuration owning logic |
| Raw GPS telemetry | GPS/tracking provider/device | Tracking ingestion adapter | Provider/device receipt metadata | Tracking module only |
| Current vehicle operational state | Control Centre | Derived from accepted telemetry | Last update, confidence, device health | Tracking module only |
| Route plans and versions | Control Centre | Optimizer and authorized office commands | Optimization diagnostics | Routes module only |
| Collection outcomes | Control Centre | Driver PWA or authorized correction | Offline sync/conflict metadata | Route Operations module only |
| Map/geocode/distance calculation | Mapping provider supplies result; Control Centre owns business record | Mapping adapter | Provider request/response metadata subject to retention | Provider cannot modify MegaBin entities |
| Message rules/templates and message intent | Control Centre | Authorized configuration/operations | Provider selection | Communications module only |
| Message delivery events | WhatsApp/SMS/email provider | Communications adapter/webhook | Provider message ID, status, error | Provider metadata updates delivery attempts only |
| Audit record | Control Centre | Application/platform writers | Correlation and actor metadata | Append-only Audit module |

## Transitional website rule

WordPress remains local-save-first and does not depend on synchronous Control Centre availability. It forwards submissions reliably with a stable source reference and idempotency key. Activation is the authority boundary: after activation, operational edits occur in the Control Centre, not in WordPress or spreadsheets.
# Phase 1A ownership additions

| Data | Authoritative owner | Permitted inbound source | Notes |
|---|---|---|---|
| Client and contacts | Clients module | Future website/accounting adapters through commands | Control Centre authoritative after activation |
| Service address and validation state | Service Addresses module | Future geocoder adapter through commands | Provider metadata is not address identity |
| Client service and permanent configuration | Clients / Service Configuration | Future onboarding and accounting consequences | Operational truth; payment truth remains external |
| Regions, depots, territories | Geography module | Office administration | Polygon changes never silently reassign services |
| Teams and staff directory | Workforce module | Office administration | Not an HR or payroll record |
| Vehicles | Vehicles module | Office administration; future tracking/maintenance adapters | Raw GPS and maintenance workflows remain deferred |
| External references | Integrations module | Approved adapters | Unique only within source-system/entity scope |

