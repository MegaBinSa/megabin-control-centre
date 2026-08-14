# Synthetic UAT Execution and Evidence Guide

1. Record the deployed Staging release/deployment identity and tester identity.
2. Validate `config/synthetic-uat-catalogue.json` with `pnpm uat:validate`.
3. Confirm synthetic personas, fake routing/optimization, fake accounting and capture communications. Stop if any live provider or real recipient/data is present.
4. Prepare only journey-specific `megabin-uat` records using `uat:` source/idempotency identities. Do not reset the database or delete shared personas.
5. Execute one case at a time and preserve screenshots, API/job references and immutable domain identifiers without exporting secrets or sensitive payloads.
6. Set `Passed`, `Failed`, `Blocked` or `Not Run`. Passed/Failed require actual outcome, evidence, timestamp, release identity and tester. Link defects/blockers.
7. Recycle only records rooted in the documented synthetic namespace after retention/evidence needs are satisfied.

The six baseline journeys are Office planning, Driver offline execution, website onboarding, Client SKIP, financial/accounting isolation, and vehicle tracking/intelligence. The catalogue is intentionally MegaBin-specific rather than a generic test-management framework. Phase 5D repository verification validates the contracts; no business journey is marked Passed until it actually runs on shared Staging.

