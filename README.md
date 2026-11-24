# MegaBin Control Centre

MegaBin Control Centre is the internal operations platform for MegaBin, a weekly garden-refuse collection business in Pretoria. It is separate from the public WordPress website.

The repository contains the Office web app, Driver PWA, Supabase schema and Edge Functions, synthetic tests, and the architecture and operations records. Shared Staging is deployed. Production is not.

## Current stage

Synthetic Internal UAT Passed on 2026-10-17, with explicit project-user sign-off of all six synthetic journeys. Controlled pilot and production remain blocked. Do not replay Staging UAT fixtures or deploy because this status changed.

Start with:

- [Readiness gates](docs/production/readiness-gates.md) and [config/readiness-gates.json](config/readiness-gates.json)
- [Synthetic UAT sign-off and pilot-entry packet](docs/production/synthetic-uat-signoff-and-pilot-entry.md)
- [Production gap register](docs/production/production-gap-register.md)
- [Architecture index](docs/architecture/architecture-index.md)

## Repository boundary

- This repository owns the Control Centre platform.
- The MegaBin WordPress website remains a separate system and repository.
- No secrets, production credentials, WordPress runtime files, generated builds, or local environment files belong in this repository.

## Local development

See the [local development runbook](docs/runbooks/local-development.md). That workflow is local only and does not deploy Staging or production.
