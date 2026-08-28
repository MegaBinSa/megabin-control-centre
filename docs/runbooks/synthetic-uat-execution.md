# Synthetic UAT Execution and Evidence Guide

1. Record the deployed Staging release/deployment identity and tester identity.
2. Validate `config/synthetic-uat-catalogue.json` with `pnpm uat:validate`.
3. Confirm synthetic personas, fake routing/optimization, fake accounting and capture communications. Stop if any live provider or real recipient/data is present.
4. Prepare only journey-specific `megabin-uat` records using `uat:` source/idempotency identities. Do not reset the database or delete shared personas.
   For `UAT-OFF-001`, confirm the Client and Client Service are active, select a date matching `configured_collection_day`, and prove at least one service is due before publication. Retain `assignedStopCount >= 1`, each stop identity and its planned drum count as evidence. If an unsuitable prior Route Operation would be selected by the Driver PWA, preserve it as evidence and use the supported cancellation lifecycle; never delete it.
5. Execute one case at a time and preserve screenshots, API/job references and immutable domain identifiers without exporting secrets or sensitive payloads.
6. Set `Passed`, `Failed`, `Blocked` or `Not Run`. Passed/Failed require actual outcome, evidence, timestamp, release identity and tester. Link defects/blockers.
7. Recycle only records rooted in the documented synthetic namespace after retention/evidence needs are satisfied.

## Office browser checkpoint

Before continuing `UAT-OFF-001`, record the deployed release identity and prove that reload restores the active Office module and selected region/date. Wait for the explicit loading state to clear before interpreting roster or route-plan status. A roster or plan response is valid only for the region/date visible in the URL and controls. Stop and record a blocker if another date briefly appears, routine session renewal returns the operator to Clients, or an in-flight request repaints a different workspace. Never repeat a mutating action merely because navigation reset or loading obscured its result.

The six baseline journeys are Office planning, Driver offline execution, website onboarding, Client SKIP, financial/accounting isolation, and vehicle tracking/intelligence. The catalogue is intentionally MegaBin-specific rather than a generic test-management framework. Phase 5D repository verification validates the contracts; no business journey is marked Passed until it actually runs on shared Staging.

## Protected Website Intake submission

`UAT-WEB-001` intake creation uses the manual-only **Submit staging Website UAT intake** workflow and the protected GitHub `staging` Environment. The workflow accepts the exact current `main` SHA, the reserved identity `uat:web:UAT-WEB-001:20260825:01`, a controlled `initial_submission` or `idempotency_retry` mode, and this confirmation:

`SUBMIT-UAT-WEB-001:xniweqdmswzljcgkfglx:uat:web:UAT-WEB-001:20260825:01:<source-sha>:<mode>`

The request body is immutable repository configuration in `config/synthetic-uat-website-intake.json`; operators cannot supply arbitrary payloads, URLs, project references, SQL or credentials. The workflow requires the requested SHA to equal current `origin/main`, requires successful quality/database checks, runs under the shared-Staging concurrency boundary and obtains `WEBSITE_ONBOARDING_SECRET` only from the protected Environment. It performs one POST through the existing Website Onboarding boundary and no database administration or deployment operation.

The initial execution must receive HTTP `202` with `duplicate: false`. The later deliberate retry uses the same identity, idempotency key and byte-identical payload and must receive HTTP `200` with `duplicate: true`. Retain the sanitized evidence artifact containing workflow/release identity, operator, source/idempotency identity, payload SHA-256, correlation ID, safe response status, duplicate result and submission ID. It excludes the integration secret, request body, contact details and address. GitHub artifact retention is currently 90 days and does not satisfy the separate 12-month assurance target.

Before the deliberate retry, confirm the initial submission has progressed through its durable processing job to `needs_review`, has a resolved service region, appears once in the scoped Office queue, and has no activation references. A raw `received` row with zero processing attempts is Blocked evidence: do not retry merely to hide it. After deployment of the durable-processing boundary, the preserved receipt is queued by migration and the next exact protected retry or bounded processor invocation may resume that same submission ID; it must not create another intake.
