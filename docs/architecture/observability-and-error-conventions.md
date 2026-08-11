# Observability and Error Conventions

**Status:** Phase 0B-5 foundation

## Trace context

Every request or technical workflow receives a correlation ID. Child application commands, outbox events, integration attempts, and jobs preserve it. Causation IDs identify the immediately preceding command or event; request, job, and event IDs identify their own execution record.

```text
API request ID
  -> command ID
  -> outbox event ID
  -> integration interaction ID
       all share one correlation ID
```

## Structured records

Logs contain timestamp, level, safe message, trace context, environment, service, build ID, and structured safe metadata. Dynamic values do not get concatenated into the message when they belong in metadata.

Sensitive keys—including authorization, cookies, credentials, passwords, secrets, tokens, names, email, phone, and addresses—are redacted by the shared contract. Redaction is defense in depth: producers should use an allowlist and avoid sending PII or secrets to logging code at all.

## Error taxonomy

Stable categories are validation, authentication, authorization, conflict, transient dependency, permanent dependency, rate limit, cancelled, and unexpected. External errors are translated at adapter boundaries. User/API responses use the stable API error taxonomy and never expose stack traces, SQL, secret material, or raw provider payloads.

Technical diagnostics are not business audit. Business decisions and authoritative state changes belong in long-lived Audit records; transient errors and provider activity follow the technical retention policy.
