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

