# ADR-002: PostgreSQL as Operational Source of Truth

**Status:** Accepted

## Context

WordPress, spreadsheets, providers, and future integrations can otherwise create conflicting operational records.

## Decision

Supabase PostgreSQL is the single source of truth for activated-client operational data. External systems retain authority only for explicitly assigned facts, such as website intake before activation, accounting facts, raw provider submissions, and delivery events.

## Consequences

- Every authoritative entity has one owning module.
- External data enters through controlled adapters with provenance and conflict handling.
- Activation marks the authority transition from website intake to Control Centre operations.

## Rejected alternatives

- Google Sheets or WordPress as the long-term operational database.
- General bidirectional synchronization between operational stores.

