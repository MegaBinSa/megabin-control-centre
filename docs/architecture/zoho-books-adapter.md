# Zoho Books Adapter

**Production status:** Not activated

Phase 4C defines a real-adapter shell and a deterministic fake Zoho Books adapter. No live credentials or customer payloads are present. Local and CI use `zoho-books-fake` to prove customers, invoices, payments, credits, incremental changes, rate limits, authentication failures, and outages.

Production activation requires a separate environment configuration exercise: create the Zoho organization/application, store OAuth credentials in Supabase Edge Function secrets, set the non-secret organization identifier and credential reference, validate read-only scopes, enable pagination/rate-limit translation, run staging fixtures, and approve live lifecycle activation. A production provider ADR is required when the actual credential/scoping/deployment commitment is made.
