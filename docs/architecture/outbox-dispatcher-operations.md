# Outbox Dispatcher Operations

**Status:** Phase 0B-6 executable proof

```text
pending -> processing -> published
              |
              +-> pending after bounded backoff
              +-> dead_letter after maximum attempts
dead_letter -> pending through authorised replay
```

Claims use bounded batches and PostgreSQL `FOR UPDATE SKIP LOCKED`, set worker ownership, and increment attempts atomically. Completion and failure require the same worker. One failing event does not stop its batch.

Retry uses bounded exponential backoff. Only safe error summaries are stored. Event, causation, and correlation IDs propagate to the adapter. Successful fake-adapter effects are idempotent by event ID.

Dead letters appear in outbox health and restricted diagnostics. Replay requires `platform_proof.replay`, retains the event ID, resets attempts, increments replay count, and writes a technical audit fact. There is no public replay API or operator UI in this phase.
