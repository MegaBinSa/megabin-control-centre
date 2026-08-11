# Security and RLS Model

**Status:** Approved security foundation; policies are not yet implemented

## Identity and authorization

- Supabase Auth supplies user identity and session assurance.
- Application-controlled tables own users' roles, granular permissions, assignments, and access scopes.
- Authorization is least-privilege and deny-by-default.
- User-editable metadata is never used for authorization decisions.
- Server-controlled JWT claims may support coarse checks, but database/application authorization remains authoritative and accounts for claim staleness.
- Director/Admin business authority and System Admin/Developer technical authority remain distinct.
- High-risk actions require stronger assurance/recent re-authentication and an audit reason.

## Access dimensions

Authorization may combine:

- Granular permission.
- Service region.
- Team and vehicle assignment.
- Current roster/route relationship.
- Record sensitivity.
- Approved driver device where applicable.

Being authenticated alone does not authorize operational data access.

## RLS principles

- Enable RLS on every table in an exposed schema.
- Expose tables and grant Data API access deliberately; grants and RLS are separate controls.
- Frontend direct access is allowed only for explicitly approved read models or simple operations fully secured at the database boundary.
- State transitions, privileged operations, and cross-module writes go through owning application services.
- Policies must include resource/scope predicates; `authenticated` is not sufficient authorization.
- UPDATE policies require appropriate row visibility plus both existing-row and new-row checks.
- Columns used by policies must be indexed where appropriate.
- Views exposed to users must preserve caller security semantics.
- Privileged database functions are exceptional, kept out of exposed schemas, tightly granted, and reviewed; they are never a shortcut around RLS.
- RLS tests must include negative cross-region, cross-team, revoked-device, and driver-data-minimization cases.

## Credentials and secrets

- Browser/PWA code may receive only the environment's public project URL and publishable client key.
- Service-role/secret keys, database passwords, provider secrets, and Supabase management credentials never enter frontend bundles or committed files.
- Secrets are separately configured per environment.

## Storage and Realtime

- Storage authorization is designed separately from database row authorization and ties evidence to authorized operational records.
- Private objects are accessed through policy-controlled operations or short-lived signed access.
- Realtime is used selectively for current operational projections, never as the source of truth and not for indiscriminate raw GPS broadcast.

## Phase 0B-3 proof boundary

The initial implementation proves the model with:

- A self-readable `public.user_profiles` identity link protected by RLS.
- Private role, permission, assignment, and access-scope tables under `app_private`.
- A non-exposed, tightly granted authorization helper with a locked search path.
- An exposed, non-business `authorization_probes` table whose SELECT policy requires both permission and scope.
- No direct frontend grants for authorization administration or proof-resource writes.
- pgTAP tests covering global scope, matching-region scope, cross-scope denial, inactive users, user-metadata escalation attempts, profile isolation, and direct-write denial.

The proof table and permission are not operational product concepts. They may be removed once the same policy pattern is proven against the first real Phase 1 module.
# Phase 1A master-data enforcement

Master tables remain in the non-exposed `app_private` schema. Authenticated read grants are explicit and filtered by RLS using authoritative permission, active-profile, and service-region scope tables. Driver/Team has no master-data permission and therefore no client/contact visibility. Client and address region scope is derived through current service configuration; sensitive fields are never put into broad operational read models.

All direct authenticated writes are revoked. Service-role API functions re-authorize the supplied authenticated actor against application tables and commit state, audit, idempotency, and events transactionally. Service-role credentials remain server-only. User-editable Auth metadata is not consulted.
