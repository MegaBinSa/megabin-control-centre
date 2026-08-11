# ADR-006: Supabase Auth, Application Permissions, and RLS

**Status:** Accepted

## Context

Authentication alone cannot express granular permission, region, team, vehicle, device, and data-minimization requirements.

## Decision

Use Supabase Auth for identity and sessions, application-controlled roles/permissions/access scopes for authorization, and RLS as a core database boundary. Never use user-editable metadata for authorization. Authentication does not imply access to operational rows.

## Consequences

- Permission and RLS matrices require automated positive and negative tests.
- JWT claims used for coarse checks must be server-controlled and treated as potentially stale.
- Privileged credentials never reach frontend code.

## Rejected alternatives

- UI-only authorization.
- `authenticated`-only RLS policies.
- Encoding authorization in user-editable profile metadata.

