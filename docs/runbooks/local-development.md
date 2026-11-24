# Local Development

**Status:** Local toolchain and Supabase workflow. This runbook does not link or deploy a hosted project.

## Prerequisites

- Node.js version from `.node-version`.
- pnpm version declared by `packageManager` in `package.json`.
- Docker Desktop or another Docker-compatible runtime for local Supabase.

## Install and verify

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

## Local Supabase

The pinned Supabase CLI is a project dependency. Use the repository scripts rather than an unrelated global version:

```powershell
pnpm supabase:db:start
pnpm supabase:reset
pnpm supabase:status
```

`supabase db reset --local` is destructive only to the local development database. Never add `--linked` to routine development scripts.

Create migrations through the CLI so filenames are correctly generated:

```powershell
pnpm supabase migration new <descriptive-name>
```

Review the SQL and reset the local database from scratch. The application schema is already in `supabase/migrations`. Do not hand-write database types; if a generated type artifact is introduced, generate it from the verified local database.

## Environment safety

- Local secrets belong in ignored environment files.
- `supabase/config.toml` may reference secrets with `env(...)`; never hard-code them.
- The local SMTP capture service does not deliver real email.
- No hosted project is linked by this runbook.

## Phase 0B-6 runtime proof

The runtime proof is disabled unless local configuration and its feature flag explicitly enable it. Use synthetic identities only. The database behavior is exercised with:

```powershell
pnpm supabase:reset
pnpm supabase:test:db
```

With Docker running, serve the thin Edge entry point using:

```powershell
pnpm exec supabase functions serve platform-runtime
```

The endpoint is `/functions/v1/platform-runtime/api/v1/platform-proof`. It requires a valid local user JWT, `Idempotency-Key`, `X-Correlation-Id`, synthetic execute permission/global scope, configuration, and the synthetic flag. Do not use a service-role key as the caller identity.

Deterministic transport/application demonstrations run in `pnpm test`; they use no live provider or operational data.
