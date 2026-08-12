# Office geography administration workflow

Use the **Geography** workspace after signing in with region-scoped geography permission.

- Select a service region, then toggle depot or service-address markers.
- Select a territory to inspect priority, status, geometry, default depot, collection days, and eligible teams.
- **Draw territory** creates a draft. Enter metadata, inspect GeoJSON, and explicitly save or cancel.
- **Edit geometry and metadata** loads the authoritative version. Preview impact before save. A `409` means another user changed it; reload rather than overwriting.
- Use **Assignment reviews** after a territory change. Confirm only when the suggested territory should become the configured assignment; retain/dismiss leaves the current assignment intact.
- Service-address geography shows the normal suggestion separately from the permanent configured territory and override flag.

The local adapter draws a neutral schematic base. No provider token is required. Synthetic E2E tests mock fixed API responses and must not use real addresses or providers.
