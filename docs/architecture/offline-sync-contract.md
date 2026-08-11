# Offline Synchronization Contract

**Status:** Phase 0B-5 generic contract

## Action envelope

A future Driver/Team offline action carries an immutable action ID, registered device ID, device-local timestamp, client sequence number, idempotency key, correlation ID, operation type, payload version, and JSON payload. The server adds its receipt timestamp and returns one outcome: `accepted`, `duplicate`, `conflict`, or `rejected`.

- An unseen action identity is eligible for normal validation and acceptance.
- The same identity and canonical fingerprint is a duplicate and returns the prior result without repeating effects.
- The same identity with different content is a conflict and changes nothing automatically.
- Invalid, unauthorized, expired, or device-revoked actions are rejected with a stable safe code.

Client timestamps and sequence numbers help ordering and diagnosis but never override authoritative server state by themselves. A registered device remains subordinate to the authenticated user, permissions, current assignment, and revocation state.

## Generic conflict

A conflict records the incoming value/event, current authoritative server state, source device or integration, reason, status (`open`, `resolved`, or `dismissed`), and optional resolver/time. Resolution is explicit and audited; last-write-wins is prohibited.

No route caching, GPS buffering, stop workflow, or MegaBin-specific conflict reason is implemented in this phase.
