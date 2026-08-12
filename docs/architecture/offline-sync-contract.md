# Offline Synchronization Contract

**Status:** Phase 3A route-execution implementation

## Action envelope

A future Driver/Team offline action carries an immutable action ID, registered device ID, device-local timestamp, client sequence number, idempotency key, correlation ID, operation type, payload version, and JSON payload. The server adds its receipt timestamp and returns one outcome: `accepted`, `duplicate`, `conflict`, or `rejected`.

- An unseen action identity is eligible for normal validation and acceptance.
- The same identity and canonical fingerprint is a duplicate and returns the prior result without repeating effects.
- The same identity with different content is a conflict and changes nothing automatically.
- Invalid, unauthorized, expired, or device-revoked actions are rejected with a stable safe code.

Client timestamps and sequence numbers help ordering and diagnosis but never override authoritative server state by themselves. A registered device remains subordinate to the authenticated user, permissions, current assignment, and revocation state.

## Generic conflict

A conflict records the incoming value/event, current authoritative server state, source device or integration, reason, status (`open`, `resolved`, or `dismissed`), and optional resolver/time. Resolution is explicit and audited; last-write-wins is prohibited.

Phase 3A applies this contract to route lifecycle, stop result, capacity, and completion actions. The Driver PWA persists the manifest projection and action queue in IndexedDB, preserves unresolved work across reloads, synchronizes in client-sequence order, and keeps failures/conflicts/rejections visible. It does not cache API responses through the service worker. GPS buffering remains deferred.
