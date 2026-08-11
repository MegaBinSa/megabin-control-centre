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

