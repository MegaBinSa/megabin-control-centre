# Synthetic UAT Results

**Status:** UAT-OFF-001, UAT-DRV-001 and UAT-WEB-001 Passed; three journeys remain Not Run

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Passed | Manual protected-Staging execution completed on `2026-08-25`, release `c74bea8b7f09d572c9d1f12182d3082eca063de6`, by Shaun. See the evidence record below. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Passed | Manual protected-Staging execution on `2026-08-24`, release `c74bea8b7f09d572c9d1f12182d3082eca063de6`, by Shaun. See the evidence record below. |
| `UAT-WEB-001` | Website onboarding | Passed | Protected submission, durable processing, identical retry, Office review/approval and atomic regional activation completed by Shaun; final state verified on release `faf4be5d0b676f21bcd8f5d3cea584e860b78107`. |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

## UAT-WEB-001 — Passed

Shaun completed the Website onboarding authority-transition journey in Shared Staging using reserved source identity `uat:web:UAT-WEB-001:20260825:01`. The protected initial-submission workflow accepted the immutable synthetic payload exactly once with HTTP `202` and `duplicate: false`. Its sanitized evidence retained release/workflow identity, payload fingerprint, correlation, response status and intake ID without retaining the signing secret or unnecessary contact/address data.

### Original processing failure and remediation

The initial receipt created intake `cf7ae5ba-4560-4568-aaf1-354787f7b1b2`, but it remained `received` with zero processing attempts because processing relied on non-durable deferred Edge Function work after the HTTP response. This was recorded as Blocked rather than hidden by a retry. PR #75 replaced that boundary with a durable, idempotent processing job. Deployment of migration `20260828110624_website_intake_durable_processing.sql` queued the preserved receipt without processing or duplicating it; the deployed worker then completed job `9b8dc333-a3c5-4212-9f4f-ef1eaffa23b5` once. Processing history recorded success, the intake moved to `needs_review`, Pretoria Test Region was resolved, and the scoped Office queue displayed it.

The deliberate byte-identical retry then returned HTTP `200`, `ok: true` and `duplicate: true`, with the same intake ID and request fingerprint. Exactly one intake remained. This was the catalogue's repeated-submission/idempotency assertion; no second activation is required by this case.

### Review, approval and activation

Office review verified normalized synthetic values, two requested drums, `no_match` client/address results, and suggestions for Synthetic North and Synthetic Central Depot. Approval froze the decision to create a Client, Service Address and Client Service in Pretoria Test Region, assigned to Synthetic North, Synthetic Central Depot and Synthetic Team A, with Monday collection, two drums and effective date `2026-08-25`. The approval reason, one review-history entry, one `website_intake.approve` audit fact and one `WebsiteIntake.Approved` event remain retained under correlation `36ca573d-015f-4be6-8e17-e5184b39e697`.

The first activation attempt was denied before transactional mutation because the legacy activation path required global `master_data.write` even after validating the actor's regional `website_intake.activate` and Pretoria scope. The intake remained approved at version 3 with no activation references or partial master data. PR #76 introduced the bounded regional activation path in migration `20260830094620_website_intake_regional_activation.sql`: it uses the frozen approved service region, preserves ordinary global master-data creation rules, and continues to deny cross-region activation. No global permission or scope was granted.

After protected deployment of PR #76, the same approved intake activated successfully as `Synthetic Staging Office`. Final read-only verification found lifecycle `activated`, review status `approved`, version 4, unchanged frozen decision/reason, and these linked authoritative identities:

- Client `85e19649-fb52-42e0-9e73-8ce55a65bc51` — active.
- Primary Contact `81b03b7a-69c9-4f98-8956-0bf38291ebe6` — active.
- Service Address `5cf5552d-13b8-45fd-ada7-198a13f06584` — present and not archived.
- Client Service `b0c742aa-9484-4c49-afd5-c164404c8080` — active, weekly.
- Service Configuration `d59e530b-5846-4dcf-ba7f-1c0bcb06fade` — Pretoria Test Region / Synthetic North / Synthetic Central Depot / Synthetic Team A / Monday / two configured and operational drums / effective `2026-08-25` with no end date.

Exactly three active `megabin_website` external references link the source intake, customer reference and service reference to those authoritative records. Exactly one `website_intake.activated` audit fact and one `WebsiteIntake.Activated` event exist under correlation `151dd047-645e-4e58-b47b-1feb5c2b0d93`, attributed to `Synthetic Staging Office`. Approval evidence remains intact and no rejection exists.

Duplicate and integrity checks found one matching Client, Contact, Address, Service and Configuration, no orphaned activation link, and no second external reference set. The new service has zero planned stops, unassigned-route entries, collection occurrences, financial decisions, communication intents or SKIP requests. The activation correlation contains only the expected website-intake and owning master-data facts/events; activation created no route, roster, Route Operation, financial, communication or other operational action.

The final accepted evidence therefore proves protected receipt, durable visible processing, normalization/matching, scoped Office review, frozen approval, atomic authority transition, transport idempotency, audit/correlation history, authoritative references and absence of duplicates or premature operational side effects. Historical failures and their preserved retests remain part of the evidence rather than being rewritten.

## UAT-OFF-001 — Passed

Shaun completed the Office planning journey against Shared Staging release `c74bea8b7f09d572c9d1f12182d3082eca063de6`. Existing synthetic records and immutable operational history were used throughout; no reset, reseed, duplicate generation, republish or second handoff was performed.

The region-scoped `Synthetic Staging Office` persona authenticated and reviewed the permitted active Client, Client Service `59000000-0000-0000-0000-000000000001`, Service Address `58000000-0000-0000-0000-000000000001`, effective Monday Service Configuration `d9f2d3c4-f2ee-4b43-a12f-e88e7e510a75`, Pretoria geography and Synthetic Team A readiness. The locked `2026-08-24` roster showed Ready checks passing. After F5, Daily Roster, Pretoria Test Region and `2026-08-24` were restored from `?module=daily-roster&region=51000000-0000-0000-0000-000000000001&date=2026-08-24`; no stale date appeared.

The preserved Version 2 plan was Published, not stale, and retained one route, one assigned stop, zero unassigned services and two planned drums. Planned Route Stop `7747648e-edf9-44ff-b3b1-8dd9ca27b26f` referenced the correct Client Service, address and configuration at sequence 1 with two drums and a ten-minute planned duration. Synthetic Team A and Synthetic Collection Vehicle remained assigned.

Route Operation `33cb2338-30ab-4d62-adfc-27ded32ee37b`, linked to Published Route Version `f243e985-ea9c-46bc-9673-a9d6e07af6b4`, remained `completed`: Accepted **Yes**, Started **Yes**, 1/1 stops, 0 remaining, 2/2 drums, `near_capacity`, assignment revision 1, manifest revision 1 and zero open issues. It had no cancellation, supersession, stale, conflict or review warning.

Live Operations returned zero Needs Attention and no routes, positions, operational facts or warnings. Excluding the completed operation from the live projection was consistent with the authoritative Route Operations record and did not misrepresent it. Driver financial isolation was independently demonstrated by the verified `driver_team` actor receiving `403 permission_denied` from the accounting status endpoint.

The earlier Daily Roster input-level date persistence blocker is closed by the real-browser F5 evidence above. The Sunday zero-stop operation and all other historical preparation evidence remain preserved.

## UAT-DRV-001 — Passed

Shaun executed the Driver journey against Shared Staging on `2026-08-24` using the protected deployment at release `c74bea8b7f09d572c9d1f12182d3082eca063de6`. The assigned Synthetic Team A operation and all earlier unsuitable operations remain preserved; no reset, reseed or IndexedDB clearing was used.

The Driver authenticated and loaded only the assigned operation. Accept was queued while Chrome network emulation was Offline (`Offline · 1 pending`), changed local state to Accepted, and synchronized automatically within approximately ten seconds of reconnection (`Online · 0 pending`) without pressing **Sync now**. The route then started on its scheduled service date. The single stop was recorded Cleaned with two planned and two actual drums, Near Capacity was recorded, and the eligible route completed. The Driver returned to **No route assigned** after completion.

Office independently showed `completed`, Accepted **Yes**, Started **Yes**, 1/1 stops, 0 remaining, 2/2 drums, `near_capacity`, and 0 open issues. This proves the authoritative result rather than relying only on Driver-local state.

Negative authorization checks used an independently identified `Synthetic Staging Driver` / `driver_team` bearer whose permissions were limited to `route_operations.driver.act`, `route_operations.driver.read`, and `vehicle_tracking.ingest`:

- Office Staging displayed **Office access unavailable** and rendered no Office navigation or privileged/client data.
- `GET /api/v1/accounting/status` returned `403 permission_denied` and no financial data.
- `GET /api/v1/master-data/clients?serviceRegionId=51000000-0000-0000-0000-000000000001` returned `403 permission_denied` and no master data.

An intermediate `200 {items:[]}` accounting response is excluded from Driver evidence: replaying its exact bearer against `/api/v1/office/profile` proved it belonged to `Synthetic Staging Office` / `office_admin`, with regional `accounting.read` and `accounting.sensitive.read`. The accounting denial was then repeated successfully with the verified Driver token.

The browser CORS, region-scoped master-data, explicit resource-ID, operation-date, manifest-lifecycle and cross-operation queue-gating blockers encountered during preparation were resolved before this passing execution. Their preserved historical operations and terminal queue evidence were not deleted or rewritten.
