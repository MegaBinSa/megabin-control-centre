# Master Data Migration Considerations

**Status:** Phase 1A guardrails; production import remains deferred

- Generate immutable internal UUIDs before mapping legacy or provider identifiers.
- Never merge addresses solely from normalized text; multiple clients and services may intentionally share one physical address.
- Import clients, addresses, services, then effective-dated configurations in dependency order.
- Preserve source identifiers in scoped external references and retire mappings rather than reusing them.
- Normalize South African mobile numbers to `+27` E.164 before acceptance; phone and email are not globally unique.
- Resolve region, depot, territory, team, and collection-day assumptions through review rather than hard-coding Pretoria rules.
- Production imports require batch identity, dry-run validation, reconciliation counts, conflict review, rollback planning, and audit. Phase 1A seed data is synthetic only.
- Archived/cancelled records and superseded configurations remain interpretable; migration cleanup must not cascade-delete service history.

Unresolved semantics: organisation legal/display-name requirements, permitted lifecycle reversals, cadence details beyond the initial codes, territory-change review ownership, vehicle compliance field taxonomy, and staff availability structure.
