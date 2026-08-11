# Backend Runtime Architecture

**Status:** Phase 0B-6 executable proof

`@megabin/runtime` is the transport-neutral modular-monolith runtime. It hosts versioned request handling, application orchestration, configuration and flag loading, database ports, dispatch, jobs, logging, and health composition. `supabase/functions/platform-runtime` is a thin Deno entry point supplying Supabase authentication and private RPC adapters.

```text
Supabase gateway/JWT
  -> thin Edge Function bootstrap
  -> /api/v1 runtime handler
  -> authentication and authorization hooks
  -> synthetic application service
  -> api-schema PostgreSQL functions
  -> private state + idempotency + audit + outbox transaction
  -> bounded dispatcher
  -> provider-neutral fake adapter
```

The `api` database schema exposes functions only. Functions are security-invoker and executable only by `service_role`; `anon` and `authenticated` cannot use the schema. Private tables remain under `app_private` with RLS and no frontend grants.

`PlatformProofCommand`, `synthetic_platform_proofs`, and `Platform.ProofRecorded` are deliberately non-business artifacts. The endpoint is unavailable in production code paths and requires configuration, a separately evaluated safe-default flag, and permission. These artifacts should be deleted once a real module proves the same contract.

The Edge Function contains no domain rules. Edge limits suit HTTP and short I/O orchestration. Future CPU-heavy route optimisation must run in a replaceable worker behind the same contracts rather than being forced into the Edge Function or database transaction. No production deployment or credential was created.
