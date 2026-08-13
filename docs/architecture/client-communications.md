# Client Communications

**Status:** Phase 4E accepted implementation

Communications owns immutable intents, durable channel attempts, recipient delivery snapshots, templates, suppressions, provider health, normalized inbound messages, and communication history. Clients owns contact identity; source modules request an approved communication but do not call providers. Communications never decides accounting status, financial eligibility, route shape, or Route Operation state.

## Outbound flow and fallback

`Intent -> eligibility -> template rendering -> WhatsApp -> SMS -> Email -> history` is configurable at the communications boundary. Unavailable, invalid, suppressed, rejected, and permanent failures may advance to the next eligible channel. Accepted/sent/delivery-unknown stops immediate fallback. Temporary and rate-limited failures remain on the same attempt for bounded retry; authentication failures stop dispatch and degrade health.

An intent is idempotent by source domain, source reference, type, and intended occurrence. Attempts are separate durable records. Delivery callbacks are authenticated, idempotent, and monotonic: a late callback cannot move `Delivered` backward.

## Templates and recipient safety

Templates are versioned by stable key, channel and language, with `Draft -> Approved -> Active -> Retired`. Rendering accepts only declared scalar variables. Financial wording receives only approved client-safe text and never internal policy/reconciliation fields.

The exact recipient, language, contact reference, rendered version, and content required for historical interpretation are stored privately with the attempt. Broad events and generic telemetry contain identifiers and safe counts only.

Local and staging default to capture/test behavior. A destination must be allowlisted in non-production test mode; capture mode records rather than transmits. Live mode requires an explicit production environment and later approved provider configuration.

## Inbound foundation

Provider adapters authenticate and normalize inbound messages but do not interpret business commands. The communications command parser recognizes only trimmed, case-insensitive `SKIP` and `unknown`. Matching is `matched`, `ambiguous`, or `unmatched`. Recognition emits a concise fact for Phase 4F; it never changes services, routes, stops, or operations.

## Privacy and retention

Destinations, rendered content, and inbound content are sensitive and remain in protected schemas/API responses. Production retention periods for rendered content, attempts, and inbound content require legal/business approval; until then records are preserved and deletion automation is disabled.
