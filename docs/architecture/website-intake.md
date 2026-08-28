# Website Intake Architecture

Website Intake is the provider-neutral boundary for public signup submissions. `megabin_website` is the first source; WordPress concepts are not part of the domain. The website writes only immutable intake and may read only a narrow public status. It never writes authoritative master data.

## Flow and authority

Website → authenticated receipt plus durable processing job → bounded processing attempt → deterministic matches and suggestions → Office review → frozen approval → transactional activation.

Receipt and job creation commit atomically in PostgreSQL. The Edge Function then awaits a bounded first processing attempt; it does not rely on fire-and-forget work surviving after the `202` response. A committed receipt therefore remains recoverable if the runtime stops between receipt and processing. Exact transport retries reuse the intake and the same one-per-submission job, and may safely resume an unfinished attempt. The job records pending, processing, retryable failure, success or terminal failure independently from the immutable source payload.

The website is authoritative for its original signup payload until activation. After activation, Control Centre is authoritative for the resulting Client, Contact, Service Address, Client Service, and Service Configuration. Later website edits require a future controlled change-request workflow.

Phase 4A deliberately requires Office review for every valid submission. No fuzzy matching or automatic approval is used.

## Ownership, matching, and failure

Website Intake owns submissions, versioned processing interpretations, review history, duplicate classifications, and activation references. It reads master data and geography for explainable candidate matching. Client matching uses exact external reference, normalized mobile/email, and legitimate exact identifiers; names are evidence only. Address matching uses exact structured fields or coordinates within 25 metres. Multiple Clients and Services may share one address.

Geography reuses the PostGIS point-in-territory function. Zero or multiple candidates require review. Collection day and team are suggestions from permanent territory configuration, never today's roster.

Validation failures remain `invalid`, business uncertainty becomes `needs_review`, and technical failures become `failed`. A failed processing attempt records a safe processing-history entry and background-job failure with correlation, attempt and SQLSTATE only; it retains bounded retry state instead of losing a rejected background promise. Approval and rejection are never technical retries. Events contain identifiers and safe lifecycle metadata, never contact or address payloads.

The current Edge Function performs the first attempt inline after durable receipt. A scheduler may later claim due retryable jobs through the same bounded processor; scheduling is an operational concern and cannot create a second intake. Processing is idempotent for terminal intake states and a job is unique by submission, idempotency key and concurrency key.
