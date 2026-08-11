# ADR-009: Environment Isolation

**Status:** Accepted

## Context

Testing must not alter production operations or send messages to real clients.

## Decision

Maintain isolated local development, staging, and production environments with separate databases/Supabase projects where appropriate, credentials, providers, webhook endpoints, data, recipients, and secrets. Non-production messaging is restricted technically to sandbox/capture destinations or a strict allowlist.

## Consequences

- Schema changes promote through migrations and staging verification.
- Production data is not copied into non-production without approved sanitization.
- Secrets and provider configuration must be managed independently per environment.

## Rejected alternatives

- One shared Supabase project with environment flags.
- Relying on operator caution to prevent non-production client messages.

