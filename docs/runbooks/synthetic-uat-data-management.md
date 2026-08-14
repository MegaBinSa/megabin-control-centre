# Synthetic UAT Data Management

Synthetic UAT records use namespace `megabin-uat`, source/idempotency prefix `uat:`, and approved non-routable identities under `example.invalid` or the existing `megabin.local` synthetic Auth users. Preparation is idempotent. Existing Phase 5C Office and Driver personas are preserved.

`pnpm uat:data:validate` validates a proposed `prepare` or `recycle` operation only. It requires Staging identity, rejects a target matching the recorded Production project and binds confirmation to project plus namespace. It does not modify data. Journey-specific execution must be separately reviewed and limited to roots carrying the namespace/prefix and their exclusively derived records.

Database reset, schema/table truncate, unscoped delete, persona deletion and inference from names alone are forbidden during normal UAT. If safe provenance cannot be proven, retain the record and flag it for review.

