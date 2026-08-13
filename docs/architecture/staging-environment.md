# Staging Environment Architecture

**Status:** Phase 5C resources configured; first controlled deployment pending merge

Local, Staging and Production are separate security and data boundaries. Staging requires its own Supabase project, Auth tenant, Functions, database, secrets, integration registrations and separate HTTPS Office/Driver origins. Production identifiers are forbidden in Staging. The environment validator binds the declared environment, project reference, Supabase URLs, frontend URLs, CORS origins and safety modes and prints names/status only.

Staging uses synthetic data, fake routing/optimization/accounting, communications capture or allowlisted test mode, browser GPS labelled as test-only, and disabled automatic financial holds/releases and SKIP replanning. Production deployment remains disabled. Ordinary releases are additive migration deploys, explicit Function deploys, traceable frontend artifacts and non-destructive smoke checks; reset is a separate guarded operation.

The shared Staging target is deployed only from an explicitly selected commit already contained in `main`, through `workflow_dispatch` and the GitHub `staging` Environment. It is never automatically replaced by feature branches.

## Provisioned external resources

- Dedicated Supabase Staging project `xniweqdmswzljcgkfglx`
- Protected GitHub `staging` Environment with named Supabase, synthetic-persona, Cloudflare and integration configuration
- Separate Cloudflare Pages projects at `megabin-office-staging.pages.dev` and `megabin-driver-staging.pages.dev`
- Two pre-created synthetic Auth identities; application authorization is provisioned only by the database-owned Phase 5C transaction

No production infrastructure or live provider configuration is part of this environment. External alert routing and an isolated restore target/approved backup posture remain open operational dependencies.

## Scheduled processes

Outbox dispatch, bounded background jobs, accounting sync, financial reevaluation, tracking intelligence and retention are inventoried but not automatically scheduled by Phase 5B. Live-provider and destructive retention schedules remain disabled. When activated later, each schedule must be environment-aware, idempotent, bounded, observable, independently disableable and owned; a job failure must appear in health/alerts.
