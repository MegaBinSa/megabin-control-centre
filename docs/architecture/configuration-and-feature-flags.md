# Configuration and Feature Flags

**Status:** Phase 0B-5 foundation

## Typed configuration registry

Every configuration definition has a stable lowercase key, description, type (`boolean`, `number`, `string`, or JSON object), required status, and an optional validated default. Environment values are stored separately for `local`, `staging`, and `production`; there is no implicit sharing between environments.

Application code uses definitions from `@megabin/config` and validates both defaults and supplied environment values. Database constraints and a private validation trigger provide a second boundary. Configuration changes are recorded automatically in `app_private.platform_setting_changes`.

## Secrets boundary

Keys, passwords, tokens, credentials, and connection strings are not configuration values. Runtime secrets belong in isolated Supabase Edge Function secrets, another approved environment secret store, or Supabase Vault when database-side access is specifically required. The registry may store a non-secret reference name, never the secret value. Logs and change records must not contain resolved secrets.

## Feature flags

Flags have a safe boolean default and optional targets for environment, role, service region, and team. Matching uses the most specific target; if equally specific targets disagree, disabled wins. There are no percentage rollouts, user targeting, scripts, or arbitrary expressions.

Targets use immutable IDs. Service-region and team targets remain generic UUIDs until those owner modules create their master entities. Flag changes are automatically recorded. Flags control rollout, not authorization, and can never grant a permission denied by the Identity & Access model or RLS.
