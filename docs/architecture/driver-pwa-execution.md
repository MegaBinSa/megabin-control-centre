# Driver PWA route execution

## Scope

The Driver/Team PWA is a separate installable frontend for the assigned route only. It authenticates through Supabase Auth and calls versioned Route Operations APIs; it does not write operational tables directly.

## Offline boundary

The PWA caches the current immutable manifest snapshot and a local projection of stop progress in IndexedDB. The service worker caches application-shell assets only and deliberately bypasses API traffic. Actions are queued with immutable action IDs, idempotency keys, correlation IDs, assignment and manifest revisions, device timestamps, and client sequence numbers.

Queued actions have visible `queued`, `syncing`, `synced`, `failed`, `conflict`, or `rejected` states. Reconnect retries in client-sequence order. Conflicts and rejections remain visible and are never silently discarded. A cached manifest is not replaced while unresolved actions exist; freshness is checked and a changed assignment is surfaced for intervention.

IndexedDB is an availability cache, not an authorization boundary. Server authorization, assignment revision, manifest revision, and stop membership are revalidated for every action. Logout clears operational IndexedDB data before ending the Auth session. Device-loss controls and encrypted-at-rest browser storage are deployment concerns, so route manifests must contain only the minimum operational data required by the team.

## Execution contract

Drivers may accept and start their assigned operation, record one authoritative outcome per stop, report capacity, and complete only after every authoritative stop has a terminal result. Cleaned stops require a non-negative actual drum count. Alert-worthy outcomes create minimal Operational Issues through the Route Operations application boundary.

Office progress is a derived read model containing stop totals, serviced/not-serviced counts, drum totals, capacity, and open-issue count. It does not create a second source of truth.
