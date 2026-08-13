# Permissions Matrix

**Status:** Phase 0B-3 authorization foundation

## Model

Supabase Auth establishes identity. Application-controlled tables assign users to roles, roles to granular permissions, and users to access scopes. Authorization requires all of the following:

1. An authenticated user linked to an active application profile.
2. A role that grants the requested permission.
3. A global scope or a matching resource scope.

User-editable Auth metadata is never an authorization source. Server-controlled JWT claims may later support coarse or cached checks, but the application tables remain authoritative and JWT staleness must be considered.

## Scope kinds

| Scope | Meaning |
|---|---|
| `global` | Applies across the operational platform for the granted permission |
| `service_region` | Applies only to one immutable service-region ID |
| `team` | Applies only to one immutable team ID |
| `vehicle` | Applies only to one immutable vehicle ID |

The generic scope identifiers are deliberately not foreign keys yet because the corresponding Phase 1 master entities do not exist. Their values must eventually reference immutable IDs owned by those modules, and the transition must be recorded in a migration.

## Phase 0 proof permission

| Permission | Purpose | Production role assignment |
|---|---|---|
| `authorization_probe.read` | Proves combined permission- and scope-aware RLS against a non-business resource | None; test-only data supplies assignments |

Operational permissions and default role bundles are deferred until their owning workflows are designed. The proof does not hard-code Director/Admin, Operations Manager, Office/Admin, Driver/Team, or System Admin/Developer permission bundles.

## Write boundary

Authorization tables and assignments are stored in the non-exposed `app_private` schema. Frontends cannot edit them directly. Future changes must pass through Identity & Access application services, enforce grant-within-own-authority rules, and create audit records.

## Phase 1A master-data permissions

| Role | Master data read/write | Sensitive client/contact read | External reference management |
|---|---|---|---|
| Director/Admin | Yes, assigned scope | Yes | Deferred to explicit integration authority |
| Operations Manager | Yes, assigned scope | Yes | No |
| Office/Admin | Yes, assigned scope | Yes | No |
| Driver/Team | No | No | No |
| System Admin/Developer | Yes, assigned scope | No by default | Yes |

Region-scoped access requires a matching service-region scope; global scope is explicit. Clients and addresses derive region visibility through current service configuration. Direct authenticated table writes are denied; important writes use the service-role application boundary and re-authorize the actor from application tables.

## Phase 1B enforcement

Office navigation is permission-aware, but it is never the security boundary. The application API loads role/permission/scope assignments from application-controlled tables and re-authorizes each request. Client and contact routes require `clients.sensitive.read`; other resources require `master_data.read`; writes require `master_data.write`. A Driver/Team role has none of these permissions and cannot enter Office administration. Region-filtered lists apply the same region predicate to returned rows after authorization, preventing cross-region object access.

## Phase 1C geography permissions

| Role | `geography.read` | `geography.write` |
|---|---|---|
| Director/Admin | Yes, assigned scope | Yes, assigned scope |
| Operations Manager | Yes, assigned scope | Yes, assigned scope |
| Office/Admin | Yes, assigned scope | Yes, assigned scope |
| Driver/Team | No | No |
| System Admin/Developer | Yes, assigned scope | No by default |

Every geography API re-authorizes service-region scope. The browser has no direct execute grant on privileged geography RPCs and no direct write grant on Geography tables.

## Phase 1D roster permissions

| Role | Read | Prepare/write | Generate | Lock | Unlock | Availability |
|---|---|---|---|---|---|---|
| Director/Admin | Yes | Yes | Yes | Yes | Yes | Yes |
| Operations Manager | Yes | Yes | Yes | Yes | Yes | Yes |
| Office/Admin | Yes | Yes | Yes | Yes | No | Yes |
| Driver/Team | No | No | No | No | No | No |
| System Admin/Developer | No by default | No | No | No | No | No |

All grants remain service-region scoped. Technical system access does not imply operational authority.

## Phase 2A route-planning permissions

| Role | Read | Generate/write/validate | Publish | Replan |
|---|---|---|---|---|
| Director/Admin | Yes | Yes | Yes | Yes |
| Operations Manager | Yes | Yes | Yes | Yes |
| Office/Admin | Yes | Yes | Yes | No |
| Driver/Team | No | No | No | No |
| System Admin/Developer | No by default | No | No | No |

All route access is service-region scoped. Published versions cannot be edited even by a role with write permission.

Phase 2B adds `routes.optimize`, `routes.optimization.read`, and `routes.optimization.apply` to Director/Admin, Operations Manager, and Office/Admin. Driver/Team and System Admin/Developer receive no automatic authority. Every operation remains service-region scoped.

## Phase 2C Route Operations permissions

| Role | Office read | Create/assign | Reassign/control | Driver read/action |
|---|---|---|---|---|
| Director/Admin | Yes | Yes | Yes | Only when also current assigned staff |
| Operations Manager | Yes | Yes | Yes | Only when also current assigned staff |
| Office/Admin | Yes | Yes | Yes | No |
| Driver/Team | No | No | No | Current non-revoked assignment only |
| System Admin/Developer | No by default | No | No | No |

Permissions are `route_operations.read`, `.create`, `.assign`, `.reassign`, `.control`, `.driver.read`, and `.driver.act`. Office authority is region-scoped. Driver access additionally requires active staff membership in the current assignment and matching team/region scope; an assigned device must match.

## Phase 3B Vehicle Tracking permissions

| Role | Regional positions/health | Manage devices | Assign devices | Own-device ingest |
|---|---|---|---|---|
| Director/Admin | Yes | Yes | Yes | Only with explicit Driver relationship |
| Operations Manager | Yes | Yes | Yes | Only with explicit Driver relationship |
| Office/Admin | Yes | Yes | Yes | No |
| Driver/Team | No all-vehicle view | No | No | Active owned device and current team/region scope only |
| System Admin/Developer | No by default | No | No | No |

Permissions are `vehicle_tracking.read`, `.health.read`, `.manage_devices`, `.assign_devices`, and `.ingest`. Technical database access does not imply operational location visibility.

## Phase 3C Live Operations Intelligence permissions

| Role | Live regional view | Read facts/Needs Attention | Review/manage | Process inference |
|---|---|---|---|---|
| Director/Admin | Yes | Yes | Yes | Yes |
| Operations Manager | Yes | Yes | Yes | Yes |
| Office/Admin | Yes | Yes | Yes | No |
| Driver/Team | No | No | No | No |
| System Admin/Developer | No by default | No by default | No | No |

Permissions are `live_operations.read`, `operational_intelligence.read`, `.review`, `.process`, `needs_attention.read`, and `.manage`. Every operation is region-scoped; technical access does not grant sensitive fleet visibility.

## Phase 4A Website Intake permissions

| Role | Read/review | Approve/reject/activate | Integration management |
|---|---|---|---|
| Director/Admin | Yes | Yes | Yes |
| Operations Manager | Yes | Yes | Yes |
| Office/Admin | Yes | Yes | No |
| Driver/Team | No | No | No |
| System Admin/Developer | No by default | No | No automatic business authority |

Permissions are `website_intake.read`, `.review`, `.approve`, `.reject`, `.activate`, and `.integration.manage`. Region scope is enforced once geography is known. Sensitive payloads remain behind the application boundary; technical access never implies approval authority.

## Phase 4B Client Migration permissions

| Role | Read/create/review | Approve/activate/retry |
|---|---|---|
| Director/Admin | Yes | Yes |
| Operations Manager | Yes | Yes |
| Office/Admin | Yes | No |
| Driver/Team | No | No |
| System Admin/Developer | No by technical role alone | No |

Permissions are `client_migration.read`, `.create`, `.review`, `.approve`, `.activate`, and `.retry`. Mixed-region batch commands require global permission. Row review and activation are region-scoped once geography is known. Technical access never confers business approval.
