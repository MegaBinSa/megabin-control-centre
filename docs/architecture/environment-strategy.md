# Environment Strategy

**Status:** Approved environment-isolation policy

## Environments

| Concern | Local development | Staging | Production |
|---|---|---|---|
| Supabase | Local stack | Separate hosted project/database | Separate hosted production project/database |
| Data | Synthetic fixtures | Synthetic or explicitly sanitized test data | Real authoritative operational data |
| Auth | Developer/test identities | Test staff identities | Approved real users |
| Credentials | Local ignored files | Staging secret store | Production secret store |
| Providers | Fake, capture, or sandbox adapters | Sandbox/test provider accounts | Production provider accounts |
| Webhooks | Local/test endpoints | Staging endpoints | Production endpoints |
| Scheduled jobs | Disabled or manually triggered by default | Enabled only with safe configuration | Enabled under production controls |
| Messaging | Capture sink or fixed test recipients | Enforced test-recipient allowlist | Authorized real recipients |

## Isolation rules

- Databases, Supabase projects where applicable, credentials, provider accounts, webhook endpoints, test recipients, and secrets are never shared between staging and production.
- No production data is copied into non-production without an explicit, documented sanitization process.
- Environment identity is visible in non-production user interfaces and logs.
- Migrations are developed and tested locally, promoted to staging, verified, then promoted to production through a controlled workflow.
- Production schema changes are migration-driven; untracked Dashboard changes are prohibited.
- Destructive reset and seed workflows are limited to local or explicitly disposable environments.

## Messaging safety invariant

Non-production must be technically unable to send unrestricted messages to real clients. Enforcement belongs in the backend adapter boundary and must not depend only on UI configuration. Non-production adapters use provider sandboxes, capture mode, or a strict recipient/domain allowlist and reject all other destinations.

## Secrets

Committed documentation and configuration contain variable names and examples only. No live Supabase projects, production credentials, or provider secrets are created by this phase.

