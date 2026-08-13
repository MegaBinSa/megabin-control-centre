# Accounting Provider Contract

Providers implement customer, invoice, payment, adjustment, health, pagination, and checkpoint capabilities using normalized types from `@megabin/integrations`. Provider SDK types and raw responses cannot cross the adapter boundary.

Configuration is isolated by environment: provider, organization identifier, mode, timeout, page size, cadence foundation, lookback, retries, retry-delay cap, health, and freshness. Tokens are Edge Function secrets; the database may hold only a non-secret credential reference.

Sync modes are initial full, incremental, manual refresh, and scheduled. Browser requests create a Pending run and return immediately. Bounded background execution advances it through Pending, Running, and Succeeded/Partial/Failed/Cancelled. Provider cursors and modified timestamps drive incremental reads. Technical failures may retry; authentication, invalid response, reconciliation, and permanent business conflicts require intervention. Provider `retry-after` is capped before use.

No generic provider passthrough API exists. Provider health never changes customer operational state.
