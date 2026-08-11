# ADR-001: Supabase as Platform Foundation

**Status:** Accepted

## Context

The Control Centre needs a cohesive operational database, identity, storage, realtime delivery, serverless integration boundary, and migration workflow without operating many infrastructure products.

## Decision

Use Supabase as the platform foundation: managed PostgreSQL, Auth, RLS, Storage, selective Realtime, Edge Functions where appropriate, scheduled jobs, and version-controlled local development/migrations.

## Consequences

- The team must follow Supabase security and migration conventions and verify them against current documentation.
- Supabase-specific concerns remain behind application/domain boundaries where practical.
- Platform runtime limits must be measured before assigning heavy workloads to Edge Functions.

## Rejected alternatives

- A custom collection of unrelated backend services: unnecessary operational burden at current scale.
- Using Supabase only as a thin hosted database while duplicating its core capabilities without need.

